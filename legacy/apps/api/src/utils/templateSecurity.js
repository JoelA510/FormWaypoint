const handlebars = require('handlebars');

const KNOWN_HELPERS = {
    if: true,
    each: true,
    unless: true,
    with: true,
    eq: true
};

handlebars.registerHelper('eq', function (a, b) {
    return a === b;
});

function compileSafeTemplate(templateContent, options = {}) {
    return handlebars.compile(templateContent, {
        strict: true,
        knownHelpersOnly: true,
        knownHelpers: KNOWN_HELPERS,
        ...options
    });
}

function renderSafeTemplate(compiledTemplate, context, options = {}) {
    return compiledTemplate(context, {
        allowProtoPropertiesByDefault: false,
        allowProtoMethodsByDefault: false,
        ...options
    });
}

module.exports = {
    compileSafeTemplate,
    renderSafeTemplate,
    KNOWN_HELPERS
};
