const mongoose = require('mongoose');

const KBDocumentSchema = new mongoose.Schema({
    fileName: { 
        type: String, 
        required: [true, 'File name is required'],
        trim: true 
    },
    s3Url: { 
        type: String, 
        required: [true, 'S3 URL link is required'],
        match: [/^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/, 'Please provide a valid URL']
    },
    fileType: { 
        type: String,
        required: true
    },
    chunksCount: { 
        type: Number, 
        default: 0,
        min: 0
    },
    status: { 
        type: String, 
        enum: ['processing', 'completed', 'failed'], 
        default: 'processing',
        index: true
    }
}, { 
    timestamps: true 
});

module.exports = mongoose.model('KBDocument', KBDocumentSchema);