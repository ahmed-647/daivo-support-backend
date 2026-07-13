// controllers/chatController.js
const Conversation = require('../models/Conversation');
const FAQ = require('../models/FAQ');
const { OpenAI } = require('openai');

// Gemini imports and initialization
const { GoogleGenerativeAI } = require('@google/generative-ai');
const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Groq client (uses OpenAI SDK, just a different baseURL)
const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1'
});

/**
 * Safely parses a JSON object out of a raw AI response string.
 * Handles cases where the model wraps JSON in markdown code fences
 * or adds stray text before/after the object.
 */
function safeParseAIResponse(rawText) {
    if (!rawText) return null;

    // Strip markdown code fences if present
    let cleaned = rawText.trim().replace(/```json/gi, '').replace(/```/g, '').trim();

    // Try to isolate the first {...} block in case the model added extra text
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    try {
        return JSON.parse(cleaned);
    } catch (err) {
        return null;
    }
}

/**
 * Fires real-time Socket.io events + updates the conversation status
 * when the AI cannot resolve a query and a human agent is needed.
 */
async function handleEscalation(req, conversationId, customerId) {
    const io = req.app.get('io');

    // 1. Update DB status
    await Conversation.findByIdAndUpdate(conversationId, { status: 'pending_handoff' });

    // 2. Broadcast real-time events
    if (io) {
        io.emit('new_conversation', { conversationId, customerId }); // for admin dashboard
        io.emit('customer_waiting', { conversationId, customerId }); // for agent toast notifications
    } else {
        console.warn('[SOCKET WARNING] io instance not found on app — skipping real-time emit');
    }
}

exports.handleChat = async (req, res) => {
    const startTime = Date.now();
    try {
        const { customerId, message } = req.body;

        if (!customerId || !message) {
            return res.status(400).json({ success: false, message: "customerId and message are required" });
        }

        // 1. FAQ Context Search (text index created in an earlier task)
        const relevantFAQs = await FAQ.find(
            { $text: { $search: message } },
            { score: { $meta: "textScore" } }
        )
            .sort({ score: { $meta: "textScore" } })
            .limit(2);

        let context = "";
        if (relevantFAQs.length > 0) {
            context = relevantFAQs.map(faq => `Q: ${faq.question}\nA: ${faq.answer}`).join("\n\n");
        } else {
            context = "No direct match found in Knowledge Base.";
        }

        // 2. Advanced multilingual + structured-output system prompt.
        // Instead of guessing the user's language with regex after the fact,
        // the model itself detects the language and crafts the reply in it.
        // This generalizes to ANY language the user writes in, not just
        // English / Roman Urdu.
        const systemPrompt = `
        You are Daivo Support AI, an expert customer support assistant.
        Use the following Knowledge Base context to answer the user's question accurately.

        [CONTEXT]
        ${context}

        [INSTRUCTIONS]
        1. Detect the language/style the user wrote in (e.g. "English", "Roman Urdu",
           "Arabic", "Hindi", etc.) and reply naturally in that same language/style.
        2. If the context answers the user's query, answer accurately based ONLY on
           the context. Do not invent facts that are not supported by the context.
        3. If the context does NOT contain a relevant answer, you must NOT guess.
           Instead, mark the query as unanswerable and write a short, polite message
           (in the user's detected language/style) telling them you could not find
           an official answer and that you are forwarding them to a live support agent.

        [OUTPUT FORMAT — STRICT]
        Respond with ONLY a raw JSON object, no markdown fences, no extra text,
        in exactly this shape:
        {
          "language": "<detected language/style, e.g. English or Roman Urdu>",
          "answerable": true or false,
          "reply": "<the final message to show the user, in their language>"
        }
        `;

        // 3. AI Call with Automatic Fallback (Groq -> Gemini)
        let rawAIText;
        let usedProvider = 'groq';

        try {
            const response = await groq.chat.completions.create({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: message }
                ],
                temperature: 0.3
            });
            rawAIText = response.choices[0].message.content.trim();
        } catch (groqError) {
            console.warn("[AI FALLBACK] Groq failed, switching to Gemini:", groqError.message);
            usedProvider = 'gemini';

            const model = gemini.getGenerativeModel({ model: "gemini-2.0-flash" });
            const result = await model.generateContent(
                `${systemPrompt}\n\nUser question: ${message}`
            );
            rawAIText = result.response.text().trim();
        }

        console.log(`[AI PROVIDER USED] ${usedProvider}`);

        // 4. Parse the structured JSON response, with a safe fallback
        // in case the model doesn't return valid JSON.
        const parsed = safeParseAIResponse(rawAIText);

        let aiResponse;
        let chatStatus;

        if (parsed && typeof parsed.answerable === 'boolean' && parsed.reply) {
            chatStatus = parsed.answerable ? 'resolved' : 'escalated';
            aiResponse = parsed.reply;
        } else {
            // Fallback safety net: if the AI didn't return valid JSON,
            // escalate by default rather than risk showing broken output.
            console.warn('[AI PARSE WARNING] Could not parse structured AI response, escalating as a safety fallback.');
            chatStatus = 'escalated';
            aiResponse = "I couldn't process your request properly. Let me connect you to a live support representative.";
        }

        // 5. Save to Database
        const conversationEntry = new Conversation({
            customerId,
            message,
            response: aiResponse,
            status: chatStatus,
            responseTimeMs: Date.now() - startTime
        });
        await conversationEntry.save();

        // 6. If escalated, trigger the real-time human handoff logic
        if (chatStatus === 'escalated') {
            await handleEscalation(req, conversationEntry._id, customerId);
        }

        // 7. Return Response
        res.status(200).json({
            success: true,
            status: chatStatus,
            reply: aiResponse
        });

    } catch (error) {
        console.error("Chat API Error:", error);
        res.status(500).json({ success: false, message: "Internal server error inside Chat Engine", error: error.message });
    }
};