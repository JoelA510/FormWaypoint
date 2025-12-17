// Mock analytics service
// In a real app, this would connect to Segment, Mixpanel, etc.

function trackEvent(eventName, properties = {}) {
    console.log(`[Analytics] ${eventName}:`, JSON.stringify(properties));
}

module.exports = {
    trackEvent
};
