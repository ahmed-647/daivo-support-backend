const mongoose = require('mongoose');

const FAQSchema = new mongoose.Schema({
    question: { 
        type: String, 
        required: [true, 'Question is required'], 
        trim: true 
    },
    answer: { 
        type: String, 
        required: [true, 'Answer is required'],
        trim: true 
    },
    tags: [{ 
        type: String, 
        lowercase: true,
        trim: true
    }]
}, { 
    timestamps: true 
});

// Text index definition for robust global search capability
FAQSchema.index({ question: 'text', answer: 'text', tags: 'text' }, {
    weights: {
        question: 5,
        tags: 3,
        answer: 1
    },
    name: 'FAQ_Text_Search_Index'
});

module.exports = mongoose.model('FAQ', FAQSchema);