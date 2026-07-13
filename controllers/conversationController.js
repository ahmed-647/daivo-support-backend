// controllers/conversationController.js
const Conversation = require('../models/Conversation');
const { Parser } = require('@json2csv/plainjs');

// Helper: query filters build karna (search + date range) — dono endpoints mein reuse hoga
const buildFilter = (query) => {
    const { search, from, to, status } = query;
    const filter = {};

    if (search) {
        filter.$or = [
            { message: { $regex: search, $options: 'i' } },
            { response: { $regex: search, $options: 'i' } }
        ];
    }

    if (status) {
        filter.status = status;
    }

    if (from || to) {
        filter.createdAt = {};
        if (from) filter.createdAt.$gte = new Date(from);
        if (to) filter.createdAt.$lte = new Date(to);
    }

    return filter;
};

// 1. LIST — search + date filters + pagination
exports.getConversations = async (req, res) => {
    try {
        const filter = buildFilter(req.query);
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const [conversations, total] = await Promise.all([
            Conversation.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
            Conversation.countDocuments(filter)
        ]);

        res.status(200).json({
            success: true,
            total,
            page,
            totalPages: Math.ceil(total / limit),
            count: conversations.length,
            conversations
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching conversations", error: error.message });
    }
};

// 2. EXPORT — CSV download
exports.exportConversations = async (req, res) => {
    try {
        const filter = buildFilter(req.query);
        const conversations = await Conversation.find(filter).sort({ createdAt: -1 }).lean();

        if (conversations.length === 0) {
            return res.status(404).json({ success: false, message: "No conversations found for this filter" });
        }

        const fields = [
            { label: 'Customer ID', value: 'customerId' },
            { label: 'Message', value: 'message' },
            { label: 'Response', value: 'response' },
            { label: 'Status', value: 'status' },
            { label: 'Confidence Score', value: 'confidenceScore' },
            { label: 'Response Time (ms)', value: 'responseTimeMs' },
            { label: 'Date', value: (row) => new Date(row.createdAt).toISOString() }
        ];

        const parser = new Parser({ fields });
        const csv = parser.parse(conversations);

        res.header('Content-Type', 'text/csv');
        res.attachment(`daivo-conversations-${Date.now()}.csv`);
        res.status(200).send(csv);
    } catch (error) {
        res.status(500).json({ success: false, message: "Error exporting conversations", error: error.message });
    }
};