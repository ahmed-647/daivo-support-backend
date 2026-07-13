// utils/chromaClient.js
const { ChromaClient } = require('chromadb');

const client = new ChromaClient({ path: process.env.CHROMA_URL });

let collection;

const getCollection = async () => {
    if (!collection) {
        collection = await client.getOrCreateCollection({ name: 'daivo_kb' });
    }
    return collection;
};

module.exports = { getCollection };