// controllers/chatController.js
const Conversation = require('../models/Conversation');
const FAQ = require('../models/FAQ');
const { OpenAI } = require('openai');

// Step 4.1: Gemini Imports aur Initialization
const { GoogleGenerativeAI } = require('@google/generative-ai');
const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Groq client (OpenAI SDK, bas baseURL alag hai)
const groq = new OpenAI({
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1'
});

exports.handleChat = async (req, res) => {
    const startTime = Date.now();
    try {
        const { customerId, message } = req.body;

        if (!customerId || !message) {
            return res.status(400).json({ success: false, message: "customerId and message are required" });
        }

        // 1. FAQ Context Search (text index jo Task 2 mein banaya tha)
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

        // 2. Multilingual System Prompt
        const systemPrompt = `
        You are Daivo Support AI, an expert customer support assistant.
        Use the following Knowledge Base context to answer the user's question accurately.

        [CONTEXT]
        ${context}

        [RULES & MULTI-LANGUAGE POLICY]
        1. Dynamically match the user's language:
           - If the user asks in English, reply in concise and professional English.
           - If the user asks in Roman Urdu/Hindi (e.g., "kya mujhe refund milega?"), reply in natural Roman Urdu/Hindi.
           - Adapt to any other language the user initiates with.
        2. If the context answers the user's query, answer accurately based ONLY on the context.
        3. If the context is completely irrelevant or doesn't contain the answer, reply EXACTLY with: "UNABLE_TO_ANSWER". Do not invent facts.
        `;

        // 3. AI Call with Automatic Fallback (Groq -> Gemini)
        let aiResponse;
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
            aiResponse = response.choices[0].message.content.trim();
        } catch (groqError) {
            console.warn("[AI FALLBACK] Groq failed, switching to Gemini:", groqError.message);
            usedProvider = 'gemini';
            
            const model = gemini.getGenerativeModel({ model: "gemini-2.0-flash" });
            const result = await model.generateContent(
                `${systemPrompt}\n\nUser question: ${message}`
            );
            aiResponse = result.response.text().trim();
        }

        let chatStatus = 'resolved';
        console.log(`[AI PROVIDER USED] ${usedProvider}`);

        // 4. Escalation Logic (Agar context mein answer na mile)
        if (aiResponse.includes("UNABLE_TO_ANSWER")) {
            chatStatus = 'escalated';
            
            // Language detection for fallback
            const isEnglish = /^[A-Za-z0-9\s?,.!-]+$/.test(message) && !/\b(kya|hai|bhai|mujhe|ho|rha|na|haan|tu|rhi)\b/i.test(message);
            
            if (isEnglish) {
                aiResponse = "I couldn't find an official answer in our system. Let me connect you to a live support representative.";
            } else {
                aiResponse = "Main aapka yeh sawal hamare knowledge base mein nahi dhoond paaya. Main aapki yeh chat hamare live agent ko forward kar raha hoon.";
            }
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

        // 6. Return Response
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