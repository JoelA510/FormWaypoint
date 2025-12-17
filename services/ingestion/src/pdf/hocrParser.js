const cheerio = require('cheerio');

function parseHocr(hocrText) {
    const $ = cheerio.load(hocrText);
    const lines = [];

    // Iterate over each line
    $('.ocr_line').each((i, el) => {
        const lineId = $(el).attr('id');
        const title = $(el).attr('title'); // bbox x0 y0 x1 y1
        let bbox = null;

        if (title) {
            const match = title.match(/bbox (\d+) (\d+) (\d+) (\d+)/);
            if (match) {
                bbox = {
                    x0: parseInt(match[1]),
                    y0: parseInt(match[2]),
                    x1: parseInt(match[3]),
                    y1: parseInt(match[4])
                };
            }
        }

        const words = [];
        $(el).find('.ocrx_word').each((j, wordEl) => {
            const text = $(wordEl).text().trim();
            if (text) words.push(text);
        });

        if (words.length > 0) {
            lines.push({
                text: words.join(' '),
                bbox,
                words
            });
        }
    });

    return sortAndMergeLines(lines);
}

function sortAndMergeLines(lines) {
    // Sort by Y (top to bottom)
    lines.sort((a, b) => {
        if (!a.bbox || !b.bbox) return 0;
        return a.bbox.y0 - b.bbox.y0;
    });

    // Merge logic could go here to handle multi-column Layout Analysis
    // For now, simpler implementation returns the logical reading order text
    // but future improvements can use x-coordinates to separate columns.

    return {
        text: lines.map(l => l.text).join('\n'),
        structured: lines
    };
}

module.exports = {
    parseHocr
};
