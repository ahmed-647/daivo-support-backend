// controllers/analyticsController.js
const Conversation = require('../models/Conversation');
const mongoose = require('mongoose');

// 1. SUMMARY — total conversations, resolved %, avg response time
exports.getSummary = async (req, res) => {
    try {
        const result = await Conversation.aggregate([
            {
                $group: {
                    _id: null,
                    totalConversations: { $sum: 1 },
                    resolvedCount: {
                        $sum: { $cond: [{ $eq: ["$status", "resolved"] }, 1, 0] }
                    },
                    escalatedCount: {
                        $sum: { $cond: [{ $eq: ["$status", "escalated"] }, 1, 0] }
                    },
                    pendingCount: {
                        $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] }
                    },
                    avgResponseTimeMs: { $avg: "$responseTimeMs" }
                }
            }
        ]);

        const stats = result[0] || {
            totalConversations: 0, resolvedCount: 0, escalatedCount: 0, pendingCount: 0, avgResponseTimeMs: 0
        };

        const resolvedPercent = stats.totalConversations > 0
            ? ((stats.resolvedCount / stats.totalConversations) * 100).toFixed(2)
            : "0.00";

        res.status(200).json({
            success: true,
            summary: {
                totalConversations: stats.totalConversations,
                resolvedCount: stats.resolvedCount,
                escalatedCount: stats.escalatedCount,
                pendingCount: stats.pendingCount,
                resolvedPercent: `${resolvedPercent}%`,
                avgResponseTimeMs: Math.round(stats.avgResponseTimeMs || 0),
                avgResponseTimeSec: ((stats.avgResponseTimeMs || 0) / 1000).toFixed(2)
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error generating summary", error: error.message });
    }
};

// 2. TOP QUESTIONS — most frequently asked messages
exports.getTopQuestions = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;

        const topQuestions = await Conversation.aggregate([
            {
                $group: {
                    _id: { $toLower: { $trim: { input: "$message" } } },
                    count: { $sum: 1 },
                    lastAsked: { $max: "$createdAt" },
                    sampleResponse: { $first: "$response" }
                }
            },
            { $sort: { count: -1 } },
            { $limit: limit },
            {
                $project: {
                    _id: 0,
                    question: "$_id",
                    count: 1,
                    lastAsked: 1,
                    sampleResponse: 1
                }
            }
        ]);

        res.status(200).json({ success: true, count: topQuestions.length, topQuestions });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching top questions", error: error.message });
    }
};

// 3. PEAK HOURS — konse ghante mein sabse zyada traffic aata hai
exports.getPeakHours = async (req, res) => {
    try {
        const peakHours = await Conversation.aggregate([
            {
                $group: {
                    _id: { $hour: "$createdAt" }, // 0-23 UTC hour
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } },
            {
                $project: {
                    _id: 0,
                    hour: "$_id",
                    count: 1
                }
            }
        ]);

        // Saari 24 hours fill karo (jo hours mein data nahi wo bhi 0 ke sath dikhein — graph ke liye zaroori)
        const fullDay = Array.from({ length: 24 }, (_, hour) => {
            const found = peakHours.find(h => h.hour === hour);
            return { hour, count: found ? found.count : 0 };
        });

        const busiestHour = fullDay.reduce((max, curr) => curr.count > max.count ? curr : max, fullDay[0]);

        res.status(200).json({
            success: true,
            peakHours: fullDay,
            busiestHour: busiestHour.hour,
            note: "Hours are in UTC (0-23)"
        });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error fetching peak hours", error: error.message });
    }
};