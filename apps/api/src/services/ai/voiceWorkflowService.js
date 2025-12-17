const logger = require('../../utils/logger');

class VoiceWorkflowService {
    /**
     * Processes a transcribed voice command.
     * @param {string} text - Transcribed text from user.
     * @param {string} context - Current workflow context (e.g., 'PICKING', 'PACKING').
     */
    async processCommand(text, context) {
        logger.info(`Received voice command: "${text}" in context: ${context}`);

        const command = text.toLowerCase();

        // Simple Intent Recognition
        if (context === 'PICKING') {
            if (command.includes('confirm') || command.includes('next')) {
                return {
                    action: 'CONFIRM_PICK',
                    message: 'Pick confirmed. Moving to next item.',
                    nextStep: 'LOC_B2' // Mock next location
                };
            }
            if (command.includes('short') || command.includes('missing')) {
                return {
                    action: 'REPORT_SHORTAGE',
                    message: 'Shortage reported. Supervisor notified.',
                    nextStep: 'SKIP_ITEM'
                };
            }
        } else if (context === 'PACKING') {
            if (command.includes('box full') || command.includes('close')) {
                return {
                    action: 'CLOSE_BOX',
                    message: 'Box closed. Printing label...',
                    nextStep: 'NEW_BOX'
                };
            }
        }

        // Default fallback
        return {
            action: 'UNKNOWN',
            message: 'Command not recognized. Please repeat.',
            nextStep: null
        };
    }
}

module.exports = VoiceWorkflowService;
