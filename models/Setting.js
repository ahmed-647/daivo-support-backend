const mongoose = require('mongoose');

const SettingSchema = new mongoose.Schema({
    key: { 
        type: String, 
        required: [true, 'Configuration key is required'], 
        unique: true, 
        uppercase: true,
        trim: true
    },
    value: { 
        type: mongoose.Schema.Types.Mixed, 
        required: [true, 'Configuration value is required'] 
    },
    description: { 
        type: String,
        trim: true
    }
}, { 
    timestamps: true 
});

module.exports = mongoose.model('Setting', SettingSchema);