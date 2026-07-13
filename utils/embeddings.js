// utils/embeddings.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Ek chunk ka vector nikalta hai
exports.generateEmbedding = async (text) => {
    const model = genAI.getGenerativeModel({ model: "text-embedding-004" });
    const result = await model.embedContent(text);
    return result.embedding.values; // array of numbers (vector)
};