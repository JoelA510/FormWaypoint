const handlebars = require('handlebars');

const DEFAULT_ALLOWED_HELPERS = new Set(['if', 'each', 'unless', 'with', 'eq']);
const DEFAULT_ALLOWED_SUBEXPRESSIONS = new Set(['eq']);
const BLOCKED_PATH_SEGMENTS = new Set(['__proto__', 'constructor', 'prototype']);

function assertSafePath(pathExpression) {
    if (!pathExpression || !pathExpression.original) {
        return;
    }

    const parts = Array.isArray(pathExpression.parts) && pathExpression.parts.length > 0
        ? pathExpression.parts
        : pathExpression.original.split('.');

    for (const part of parts) {
        if (BLOCKED_PATH_SEGMENTS.has(part)) {
            throw new Error(`Disallowed Handlebars path segment: ${part}`);
        }
    }
}

function assertAllowedHelper(helperName, allowedHelpers) {
    if (!allowedHelpers.has(helperName)) {
        throw new Error(`Disallowed Handlebars helper: ${helperName}`);
    }
}

function validateHandlebarsTemplate(template, options = {}) {
    const allowedHelpers = options.allowedHelpers || DEFAULT_ALLOWED_HELPERS;
    const allowedSubexpressions = options.allowedSubexpressions || DEFAULT_ALLOWED_SUBEXPRESSIONS;
    const ast = handlebars.parse(template);

    const visit = (node) => {
        if (!node) return;

        switch (node.type) {
            case 'Program':
                node.body.forEach(visit);
                return;
            case 'ContentStatement':
                return;
            case 'MustacheStatement': {
                const isHelper = node.params.length > 0 || (node.hash && node.hash.pairs.length > 0);
                if (isHelper) {
                    assertAllowedHelper(node.path.original, allowedHelpers);
                } else {
                    assertSafePath(node.path);
                }
                node.params.forEach(visit);
                if (node.hash) visit(node.hash);
                return;
            }
            case 'BlockStatement':
                assertAllowedHelper(node.path.original, allowedHelpers);
                node.params.forEach(visit);
                if (node.hash) visit(node.hash);
                visit(node.program);
                if (node.inverse) visit(node.inverse);
                return;
            case 'SubExpression':
                if (!allowedSubexpressions.has(node.path.original)) {
                    assertAllowedHelper(node.path.original, allowedHelpers);
                }
                node.params.forEach(visit);
                if (node.hash) visit(node.hash);
                return;
            case 'PathExpression':
                assertSafePath(node);
                return;
            case 'Hash':
                node.pairs.forEach(visit);
                return;
            case 'HashPair':
                visit(node.value);
                return;
            case 'StringLiteral':
            case 'NumberLiteral':
            case 'BooleanLiteral':
            case 'UndefinedLiteral':
            case 'NullLiteral':
                return;
            case 'PartialStatement':
            case 'PartialBlockStatement':
            case 'DecoratorBlock':
            case 'Decorator':
            case 'BlockDecorator':
                throw new Error(`Disallowed Handlebars node type: ${node.type}`);
            default:
                throw new Error(`Unhandled Handlebars node type: ${node.type}`);
        }
    };

    visit(ast);
}

module.exports = {
    validateHandlebarsTemplate
};
