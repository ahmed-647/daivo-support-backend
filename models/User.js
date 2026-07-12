const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: { 
        type: String, 
        required: [true, 'Name is required'], 
        trim: true,
        maxlength: [50, 'Name cannot exceed 50 characters']
    },
    email: { 
        type: String, 
        required: [true, 'Email is required'], 
        unique: true, 
        lowercase: true, 
        trim: true,
        match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'Please fill a valid email address']
    },
    password: { 
        type: String, 
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters']
    },
    role: { 
        type: String, 
        enum: {
            values: ['admin', 'manager', 'agent'],
            message: '{VALUE} is not a valid role'
        }, 
        default: 'agent' 
    }
}, { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Single field index for lightning-fast authentications
UserSchema.index({ email: 1 });

module.exports = mongoose.model('User', UserSchema);