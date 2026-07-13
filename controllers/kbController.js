// controllers/kbController.js
const KBDocument = require('../models/KBDocument');
const path = require('path');
const { GetObjectCommand, S3Client } = require('@aws-sdk/client-s3');
const { extractFromBuffer, extractFromUrl } = require('../utils/textExtractor');
const { chunkText } = require('../utils/chunkText');
const { generateEmbedding } = require('../utils/embeddings');
const { getCollection } = require('../utils/chromaClient');
const { v4: uuidv4 } = require('uuid');

const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

// Helper: S3 stream ko buffer mein convert karna
const streamToBuffer = async (stream) => {
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    return Buffer.concat(chunks);
};

// ==========================================
// 1. FILE/URL UPLOAD
// ==========================================
exports.uploadDocument = async (req, res) => {
    try {
        let extractedText = '';
        let fileName = '';
        let fileType = '';
        let s3Url = '';

        if (req.file) {
            fileName = req.file.originalname;
            fileType = path.extname(fileName).toLowerCase();
            s3Url = req.file.location;

            const command = new GetObjectCommand({
                Bucket: process.env.S3_BUCKET_NAME,
                Key: req.file.key
            });
            const s3Response = await s3Client.send(command);
            const buffer = await streamToBuffer(s3Response.Body);
            extractedText = await extractFromBuffer(buffer, fileType);

        } else if (req.body.url) {
            fileName = req.body.url;
            fileType = 'url';
            s3Url = req.body.url;
            extractedText = await extractFromUrl(req.body.url);
        } else {
            return res.status(400).json({ success: false, message: "Provide a file or a URL" });
        }

        if (!extractedText || extractedText.trim().length < 20) {
            return res.status(400).json({ success: false, message: "Could not extract meaningful text from source" });
        }

        const kbDoc = await KBDocument.create({
            fileName,
            s3Url,
            fileType,
            rawText: extractedText,
            status: 'processing'
        });

        res.status(201).json({
            success: true,
            message: "Document uploaded and text extracted. Ready for training.",
            docId: kbDoc._id,
            fileName: kbDoc.fileName
        });

    } catch (error) {
        console.error("KB Upload Error:", error);
        res.status(500).json({ success: false, message: "Error uploading document", error: error.message });
    }
};

// ==========================================
// 2. LIST ALL DOCUMENTS
// ==========================================
exports.getAllDocuments = async (req, res) => {
    try {
        const docs = await KBDocument.find().select('-rawText').sort({ createdAt: -1 });
        res.status(200).json({ success: true, count: docs.length, docs });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching documents", error: error.message });
    }
};

// ==========================================
// 3. DELETE DOCUMENT
// ==========================================
exports.deleteDocument = async (req, res) => {
    try {
        const doc = await KBDocument.findByIdAndDelete(req.params.id);
        if (!doc) return res.status(404).json({ success: false, message: "Document not found" });
        res.status(200).json({ success: true, message: "Document deleted" });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error deleting document", error: error.message });
    }
};

// ==========================================
// 4. TRAIN (Socket.io live progress)
// ==========================================
exports.trainDocuments = async (req, res) => {
    const io = req.app.get('io');

    try {
        const pendingDocs = await KBDocument.find({ status: 'processing' }).select('+rawText');

        if (pendingDocs.length === 0) {
            return res.status(200).json({ success: true, message: "No pending documents to train" });
        }

        res.status(202).json({
            success: true,
            message: `Training started for ${pendingDocs.length} document(s)`,
            totalDocs: pendingDocs.length
        });

        const collection = await getCollection();
        let processedCount = 0;

        for (const doc of pendingDocs) {
            try {
                io.emit('training:status', { docId: doc._id, fileName: doc.fileName, status: 'chunking' });

                const chunks = chunkText(doc.rawText);
                const ids = [];
                const embeddings = [];
                const documents = [];
                const metadatas = [];

                for (let i = 0; i < chunks.length; i++) {
                    const vector = await generateEmbedding(chunks[i]);
                    ids.push(uuidv4());
                    embeddings.push(vector);
                    documents.push(chunks[i]);
                    metadatas.push({ docId: doc._id.toString(), fileName: doc.fileName, chunkIndex: i });

                    const chunkProgress = Math.round(((i + 1) / chunks.length) * 100);
                    io.emit('training:progress', { docId: doc._id, fileName: doc.fileName, chunkProgress });
                }

                await collection.add({ ids, embeddings, documents, metadatas });

                doc.chunksCount = chunks.length;
                doc.status = 'completed';
                doc.rawText = undefined;
                await doc.save();

                processedCount++;
                const overallProgress = Math.round((processedCount / pendingDocs.length) * 100);

                io.emit('training:docCompleted', {
                    docId: doc._id,
                    fileName: doc.fileName,
                    chunksCount: chunks.length,
                    overallProgress
                });

            } catch (docError) {
                console.error(`[TRAIN ERROR] ${doc.fileName}:`, docError.message);
                doc.status = 'failed';
                await doc.save();
                io.emit('training:docFailed', { docId: doc._id, fileName: doc.fileName, error: docError.message });
            }
        }

        io.emit('training:complete', { message: 'All documents processed', totalProcessed: processedCount });

    } catch (error) {
        console.error("Training Error:", error);
        io.emit('training:error', { message: error.message });
    }
};

// ==========================================
// 5. SEMANTIC SEARCH (NEW — test/debug KB directly)
// ==========================================
exports.searchKnowledgeBase = async (req, res) => {
    try {
        const { query, limit } = req.query;

        if (!query || query.trim().length === 0) {
            return res.status(400).json({ success: false, message: "Query parameter 'query' is required" });
        }

        const topK = parseInt(limit) || 5;

        // Query ka embedding banao (same model jo training mein use hua tha)
        const queryVector = await generateEmbedding(query);

        // Chroma se nearest chunks dhoondo
        const collection = await getCollection();
        const results = await collection.query({
            queryEmbeddings: [queryVector],
            nResults: topK
        });

        // Chroma ka raw response arrays mein aata hai, usko clean format mein convert karo
        const formattedResults = [];
        if (results.documents && results.documents[0]) {
            for (let i = 0; i < results.documents[0].length; i++) {
                formattedResults.push({
                    text: results.documents[0][i],
                    metadata: results.metadatas[0][i],
                    similarityDistance: results.distances ? results.distances[0][i] : null
                });
            }
        }

        res.status(200).json({
            success: true,
            query,
            resultsCount: formattedResults.length,
            results: formattedResults
        });

    } catch (error) {
        console.error("KB Search Error:", error);
        res.status(500).json({ success: false, message: "Error searching knowledge base", error: error.message });
    }
};