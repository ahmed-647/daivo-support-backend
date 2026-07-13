// utils/textExtractor.js
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const axios = require('axios');
const cheerio = require('cheerio');

// Buffer se text nikalne ke liye (S3 se file download karke)
exports.extractFromBuffer = async (buffer, fileType) => {
    if (fileType === '.pdf') {
        const data = await pdfParse(buffer);
        return data.text;
    }
    if (fileType === '.docx' || fileType === '.doc') {
        const result = await mammoth.extractRawText({ buffer });
        return result.value;
    }
    if (fileType === '.txt') {
        return buffer.toString('utf-8');
    }
    throw new Error('Unsupported file type for extraction');
};

// URL se text nikalne ke liye (webpage scrape)
exports.extractFromUrl = async (url) => {
    const { data } = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(data);
    $('script, style, nav, footer, header').remove(); // junk hata do
    const text = $('body').text().replace(/\s+/g, ' ').trim();
    return text;
};