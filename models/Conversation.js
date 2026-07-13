const mongoose = require('mongoose');

const ConversationSchema = new mongoose.Schema({
    customerId: { 
        type: String, 
        required: [true, 'Customer ID is required'], 
        index: true 
    },
    message: { 
        type: String, 
        required: [true, 'Customer message cannot be empty'],
        trim: true 
    },
    response: { 
        type: String, 
        required: [true, 'AI response cannot be empty'],
        trim: true 
    },
    confidenceScore: { 
        type: Number, 
        required: true,
        min: [0.0, 'Score cannot be less than 0'],
        max: [1.0, 'Score cannot exceed 1.0'],
        default: 1.0 
    },
     responseTimeMs: {
        type: Number,
        default: 0
    },
    status: { 
        type: String, 
        enum: ['resolved', 'pending', 'escalated'], 
        default: 'resolved'
    }
}, { 
    timestamps: true 
});

// Compound Index for analytics queries (E.g., tracking pending messages)
ConversationSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Conversation', ConversationSchema);