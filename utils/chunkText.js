// utils/chunkText.js
// Text ko overlapping chunks mein todta hai (semantic context maintain rehta hai)
exports.chunkText = (text, chunkSize = 400, overlap = 50) => {
    const words = text.split(/\s+/).filter(Boolean);
    const chunks = [];

    let start = 0;
    while (start < words.length) {
        const end = Math.min(start + chunkSize, words.length);
        chunks.push(words.slice(start, end).join(' '));
        start += (chunkSize - overlap); // overlap taake context na tootay
    }
    return chunks;
};