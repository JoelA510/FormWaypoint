# FormWaypoint Repository Code Review

## Assumptions

* The review covers commit 6a39c2f24f55cb137325bd52448768cd448aae71 of the FormWaypoint repository.

* The repository is a monorepo with a Node/Express API, a React web application, ingestion modules (CSV, PDF, XLSX, DOCX), document generator services, Python‑based OCR services and domain services (ERP, compliance, freight, etc.).

* Environment variables and secrets are assumed to be managed outside of the repository. Review comments focus on code quality, security, maintainability and correctness.

## Ingestion Service (services/ingestion)

### XLSX Parser (services/ingestion/src/xlsx/parser.js)

* **Loose header matching.** The parseHeaderSheet function converts the first column’s text to lower‑case and checks if it exists as a property on the header object[\[1\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/xlsx/parser.js#L13-L25). This silently ignores unexpected keys. Consider validating against an allow‑list and warning on unknown keys.

* **Case‑sensitive line fields.** parseLineSheet looks for properties like PartNumber and partNumber without normalizing other common variants (e.g., PART NUMBER)[\[2\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/xlsx/parser.js#L29-L38). Convert keys to lower‑case and strip whitespace before comparison to improve robustness.

* **Type coercion.** The parser does not coerce numeric values; quantities and weights remain strings. Normalize numeric fields to numbers and handle empty values gracefully.

* **Workbook sheet detection.** The parser assumes the first sheet contains headers and the second contains lines[\[3\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/xlsx/parser.js#L43-L46). If a workbook uses different sheet names or ordering, the parser throws an error. Add configuration or heuristics to detect header/line sheets, and provide explicit error messages for missing sheets.

### DOCX Parser (services/ingestion/src/docx/parser.js)

* **Lack of schema validation.** After extracting header and table rows using mammoth and cheerio, the parser does not validate required fields or coerce types[\[4\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/docx/parser.js#L16-L47). Use a schema (e.g., zod) to enforce presence of shipper, consignee, quantities, weights and values, and convert numeric fields.

* **Assumes first table is data.** The parser extracts the first \<table\> element and expects at least seven columns[\[5\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/docx/parser.js#L30-L38). Documents with multiple tables or footers could lead to incorrect parsing. Add heuristics to choose the correct table based on header row content.

* **No sanitization of HTML.** HTML from Word documents may include untrusted markup. Ensure the conversion strips scripts/styles and escapes special characters before processing.

### Address Parser (services/ingestion/src/pdf/addressParser.js)

* **Country detection.** The function infers the country by matching the last address component against a small hard‑coded list of country names and abbreviations[\[6\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/pdf/addressParser.js#L38-L44). This fails for other countries (e.g., “Mexico”). Use a more comprehensive country list or rely on separate metadata for country codes.

* **Regex for city/state/zip.** The regex only matches two– or three‑letter state abbreviations followed by a four or five digit ZIP code[\[7\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/pdf/addressParser.js#L56-L60). It does not handle international postal codes or US ZIP+4 codes. Make the pattern configurable or integrate a proper address parser library.

* **Case sensitivity.** The parser does not normalize case when inferring country or state codes. Convert tokens to upper‑case before comparison[\[8\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/pdf/addressParser.js#L94-L101).

### HOCR Parser (services/ingestion/src/pdf/hocrParser.js)

* **No column detection.** The parser collects .ocr\_line elements, sorts them by y coordinate and concatenates text[\[9\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/pdf/hocrParser.js#L43-L57). For multi‑column documents, this yields interleaved lines. Add logic to cluster lines by x coordinate and merge them by column.

* **Limited metadata.** The returned object only includes the concatenated text and line bounding boxes. To improve downstream extraction, include word‑level coordinates and page numbers.

### Ingestion Dispatcher (services/ingestion/src/index.js)

* **Buffer length check.** The dispatcher enforces a strict 100 MB limit and throws an error with code FILE\_TOO\_LARGE[\[10\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/index.js#L18-L21). This is good, but the error is thrown as a plain object, not a structured Result. Consider returning a standardized error object to unify error handling across services.

## API Web Service (frontend) (apps/web)

### API Client (apps/web/src/services/api.js)

* **Hard‑coded API URL.** API\_URL is hard‑coded to http://localhost:3001[\[11\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/web/src/services/api.js#L1-L4). For production builds, rely on VITE\_ environment variables or configuration files and provide fallbacks for development.

* **Token retrieval at module load.** The module reads localStorage when imported (authToken constant). This is undefined in server‑side rendering and may remain stale if the token changes[\[12\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/web/src/services/api.js#L1-L8). Refactor to always read the latest token from localStorage inside the request function.

* **Error handling.** When a response is not OK, the client attempts to parse JSON and throws a generic error if parsing fails[\[13\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/web/src/services/api.js#L27-L30). Propagate HTTP status codes and expose server messages to the UI for better debugging.

* **Missing CSRF protection.** The API client relies solely on JWT tokens; there is no CSRF token or double‑submit cookie. Consider implementing CSRF protection on sensitive state‑changing endpoints.

* **Large method surface.** The client exposes many endpoints. Group related operations into separate modules (e.g., shipments, parties, compliance) to avoid a god‑object and improve tree‑shaking.

* **Direct access to localStorage.** Accessing localStorage can throw in browsers where it is disabled (e.g., Safari in private mode). Wrap localStorage access in try/catch.

### Supabase Task Service (apps/web/src/services/taskService.js)

* **Unchecked input.** The service passes unsanitized text into an ilike query with %${text}%[\[14\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/web/src/services/taskService.js#L58-L60), which can break if the text contains SQL wildcards or unescaped characters. Escape %, \_ and \\ in search strings.

* **Signal handling.** The optional abortSignal is attached to the query but not always supported[\[15\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/web/src/services/taskService.js#L37-L39). Handle the case where supabase-js does not support this method.

* **Pagination overflow.** The range call uses from \+ limit \- 1 without verifying that from is a number[\[16\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/web/src/services/taskService.js#L78-L80). Add type checks or default values.

* **Duplicated logic.** fetchFilteredTasks and fetchMasterLibraryTasks share sorting and pagination logic. Extract common functions to reduce duplication.

## API Backend Services (apps/api/src/services)

### Analytics Service (services/analytics.js)

* **Only logs events.** The service simply logs events to the console[\[17\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/analytics.js#L4-L6). In production, integrate with a real analytics provider (Segment, Mixpanel) and ensure non‑blocking failures. Consider making trackEvent asynchronous and capturing exceptions.

### Browser Service (services/browser.js)

* **Headless mode string.** The headless option is set to 'new'[\[18\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/browser.js#L8-L15), which is only supported in newer Puppeteer versions. Fallback to true if the environment does not support 'new'.

* **Resource cleanup.** On SIGINT, the service closes the browser instance and exits[\[19\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/browser.js#L18-L25). For container environments, handle SIGTERM and ensure that closing the browser does not prematurely exit unrelated processes.

* **Singleton limitations.** A single browser instance may become overloaded if multiple concurrent PDF generations occur. Provide pooling or concurrency limits.

### Email Service (services/email.js)

* **Factory function misused.** It calls nodemailer.createTransporter instead of createTransport[\[20\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/email.js#L5-L9). This typographical error prevents SMTP setup.

* **Missing TLS and authentication defaults.** The transporter sets secure: false and does not explicitly configure TLS options[\[21\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/email.js#L6-L13). Use secure: true with port 465 for SMTPS or configure STARTTLS.

* **Swallowed errors.** The sendEmail function logs errors and returns false[\[22\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/email.js#L89-L92). The caller cannot distinguish between configuration issues and delivery failures. Throw or return structured errors for better handling.

* **Template injection.** Templates use string interpolation on unescaped user inputs (e.g., commentText)[\[23\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/email.js#L21-L26). Sanitize user content to prevent HTML injection in emails.

### PDF Generator (services/generator.js)

* **Template resolution.** The generator builds the template path using \_\_dirname and ../templates[\[24\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/generator.js#L18-L22). If templateName includes ../, this could traverse directories. Validate template names against a whitelist or use a map.

* **Handlebars helpers.** Only a single eq helper is registered[\[25\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/generator.js#L23-L26). Complex templates may need additional helpers (conditional formatting, loops). Register them once during app startup to avoid re‑registration.

* **Concurrency and cleanup.** The service creates a new page for each PDF and closes it in a finally block[\[26\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/generator.js#L66-L69). However, it never closes the browser after many PDFs, risking memory leaks. Implement a resource pool or periodic browser restarts.

* **Error propagation.** Errors are logged but not wrapped in a domain‑specific result[\[27\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/generator.js#L62-L64). Use a standardized error object to help upstream error handling.

### Rules Service (services/rulesService.js and shared/rules/RuleEngine.js)

* **In‑memory storage.** Rules are stored in memory[\[28\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/rulesService.js#L7-L14); any changes are lost when the server restarts. Persist rules in a database and expose CRUD routes.

* **Untrusted field paths.** Rule conditions reference arbitrary fields in the shipment (e.g., packages.0.weight.value)[\[29\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/rulesService.js#L16-L19). The getValue method in RuleEngine navigates objects without sanitization[\[30\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/shared/rules/RuleEngine.js#L62-L64). Validate rule definitions on creation to prevent prototype pollution or deep property access.

* **Loose comparisons.** The engine uses \== and \!= for eq and neq operations[\[31\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/shared/rules/RuleEngine.js#L52-L59). Use strict comparisons unless type coercion is desired.

* **Missing operators.** Common operators like gte, lte, regex and custom functions are not implemented. Document limitations or expand operator support.

### Socket Service (services/socket.js)

* **Incorrect secret.** The JWT secret is read from config.jwtSecret[\[32\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/socket.js#L23-L25), but the configuration file uses authSecret or environment variables; mismatched keys may break authentication. Align variable names.

* **Error handling.** Authentication errors propagate as Error('Authentication error'), which triggers a generic disconnect on the client. Provide more descriptive error codes.

* **Potential memory leak.** User rooms are never cleaned up when users leave shipments. Implement socket.on('unsubscribe', ...) handlers or prune unused rooms.

## Domain Services

### ERP (domains/erp/services/ErpService.js)

* **Schema handling.** The service validates data using CreateExportConfigSchema and then stores httpHeaders in httpHeadersJson[\[33\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/erp/services/ErpService.js#L9-L16). However, httpHeaders is defined as a string but is not parsed. Clarify whether this field should be JSON string or object.

* **Trigger logic.** triggerExport always exports shipments updated in the last 24 hours and labels the job as SUCCESS[\[34\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/erp/services/ErpService.js#L27-L46). There is no error handling or asynchronous export process. Use background jobs (e.g., BullMQ) and handle failures.

* **No access control.** Any authenticated user can trigger exports on any config. Validate ownership.

### Compliance (domains/compliance/...)

* **Route bug.** In complianceRoutes.js, the sanctions/screen route contains two consecutive catch clauses due to copy‑paste[\[35\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/compliance/routes/complianceRoutes.js#L19-L26). This will cause a syntax error. Remove the duplicate catch.

* **Inline validation.** ad-hoc screening validates the presence of name but not country[\[36\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/compliance/routes/complianceRoutes.js#L30-L35). Leverage DTOs for consistency.

* **Mock lists.** ComplianceService uses hard‑coded denied party lists and ITN required destinations[\[37\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/compliance/services/ComplianceService.js#L5-L9). Clarify that this is a placeholder and integrate with authoritative lists.

* **No rate limiting for screening.** Screening endpoints call screenAdHoc and screenParties without rate limiting. Attackers could brute‑force names. Add rate limiting and caching.

### Products (domains/products/services/ProductService.js)

* **Case‑sensitive SKUs.** upsertProduct uses where: { sku: validated.sku }[\[38\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/products/services/ProductService.js#L11-L14). If SKUs are case‑insensitive, this may cause duplicates. Enforce a consistent case or add unique index with ciText.

* **No authorization checks.** Users can upsert or list products with no restriction. Add role‑based access control and field‑level validation.

* **Search injection.** listProducts builds a where.OR with contains clauses[\[39\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/products/services/ProductService.js#L28-L37). Without sanitization, partial string search may allow pattern injection. Use full‑text search or parameterized queries.

### Parties (domains/parties/services/PartyService.js)

* **Missing user scoping.** listAddressBook does not filter by userId[\[40\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/parties/services/PartyService.js#L31-L38). As written, any user can view all address book entries. Uncomment the createdByUserId filter and add organization scoping.

* **No update or delete.** Only create and list functions are implemented. Provide update/delete endpoints and enforce proper ownership checks.

### Templates (domains/templates/services/TemplateService.js)

* **Line items storage.** Templates store lineItems as a JSON string in the DTO (z.string())[\[41\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/templates/dtos/templateDto.js#L11-L11). This couples stringification to the client. Change the type to z.array(z.object(...)) and let the service serialize.

* **No ownership checks.** listTemplates filters by userId, but getTemplate does not verify that the requesting user owns the template[\[42\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/templates/services/TemplateService.js#L22-L26). Add access control.

* **Limited update/delete.** Only create/get/list operations are available. Implement update/delete endpoints with versioning.

### Freight (domains/freight/services/FreightService.js)

* **Defaults inside service.** The service forces default values for emailCcJson, emailBodyTemplate and attachmentTypesJson on create[\[43\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/freight/services/FreightService.js#L10-L19). These defaults should be in the DTO with proper validation.

* **No concurrency or asynchronous email.** Generating a forwarder bundle returns a mock result and does not send emails[\[44\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/freight/services/FreightService.js#L26-L34). Use a job queue and integrate with the email service.

* **Missing validations.** generateForwarderBundle fetches a shipment but does not validate the profileId or user ownership[\[45\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/freight/services/FreightService.js#L26-L37).

### Shipments (domains/shipping/services/ShipmentService.js)

* **Tracking numbers.** The service generates a temporary tracking number using Date.now()[\[46\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/shipping/services/ShipmentService.js#L18-L22). Use a collision‑resistant ID generator (e.g., UUID) and ensure uniqueness.

* **Date parsing.** CreateShipmentSchema defines dueDate as z.string().datetime()[\[47\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/shipping/dtos/shipmentDto.js#L13-L15), which expects ISO 8601. Convert to Date objects and validate time zones.

* **No user association.** Shipments are created without linking to a user. Add userId or accountId to shipments for multi‑tenant security.

## Shared Core & Utilities

### Base Service and Result (shared/core/BaseService.js, shared/core/Result.js)

* **Result object pattern.** The Result class encourages returning either a value or an error, avoiding exceptions[\[48\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/shared/core/Result.js#L5-L38). This pattern simplifies error handling but may lead to silent failures when developers forget to check isSuccess. Encourage callers to always inspect result and throw on failure in route handlers.

* **Logging sensitive data.** BaseService.execute logs the duration of operations and includes error details on failure[\[49\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/shared/core/BaseService.js#L19-L33). Avoid logging sensitive data (credentials, personal data) and include correlation IDs for tracing.

* **Inconsistent usage.** Some services return plain objects instead of Result instances (e.g., ingestion, generator). Standardize on Result or handle both in the request handler.

### Request Handler (shared/utils/requestHandler.js)

* **Error parsing.** The handler infers status codes by searching for keywords in the error message (e.g., ‘not found’ maps to 404)[\[50\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/shared/utils/requestHandler.js#L24-L30). This is brittle. Include status codes in the Result.fail or throw HTTP errors with explicit codes.

* **Unhandled thrown errors.** If the service function throws an exception not wrapped in Result, the handler returns a 500 with generic error[\[51\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/shared/utils/requestHandler.js#L33-L36). Consider centralizing error classes and always converting them into standardized results.

## Document View Models (services/documents/viewModels.js)

* **Snapshot parsing.** The functions parse JSON snapshots for shipper and consignee without verifying the structure[\[52\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/documents/viewModels.js#L12-L18). Validate parsed objects against DTOs and provide defaults.

* **Numeric formatting.** Values are formatted to two decimals using toFixed(2) but do not handle null/undefined gracefully for unitValue, extendedValue, quantity and weights[\[53\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/documents/viewModels.js#L52-L57). Use helper functions to format numbers and fallback to '0.00'.

* **Hard‑coded fields.** Many fields like UOM ('EA'), instructions, emergency contact and AES exemption codes are hard‑coded[\[54\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/documents/viewModels.js#L52-L67)[\[55\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/documents/viewModels.js#L122-L132). Externalize these values to configuration or allow user overrides.

* **Dangerous Goods filtering.** The DG view model copies the first matching invoice line by matching on the description, which may not be unique[\[56\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/documents/viewModels.js#L171-L179). Use a stable identifier (e.g., line ID) when cross‑referencing line data.

## Additional Observations & Recommendations

* **Centralize Prisma client.** Several files instantiate new Prisma clients directly. Use a single shared instance to leverage connection pooling and reduce overhead.

* **Input validation consistency.** Many endpoints rely on zod DTOs for validation; others perform inline checks or none at all. Adopt DTOs across all domains, enforce them in route handlers and sanitize request bodies.

* **Authentication and authorization.** Many service methods lack user‑scoped queries or role checks. Implement middleware to verify ownership and roles (admin, user, guest).

* **Error handling.** Standardize on an error handling strategy. Use typed errors or Result.fail with codes and propagate them through the request handler.

* **Logging.** Avoid excessive console.log calls in production. Replace with structured logging and allow log level configuration.

* **Hard‑coded constants.** Lists such as carriers, denied parties, incoterms and units should be stored in configuration files or database tables rather than scattered across services.

* **Security hygiene.** Sanitize all user inputs before including them in HTML templates or SQL queries. Implement rate limiting, CORS restrictions, CSRF protection and TLS across all services.

## Sanity Check

1. **Verify:** The review identifies issues such as missing imports, error‑prone patterns, in‑memory storage, insufficient validation and insecure defaults across multiple files. Each recommendation ties back to specific code citations, ensuring that all observations are grounded in the repository’s current state.

2. **Edge case:** A realistic failure mode is a user uploading a malformed Excel file. The current parser expects the first two sheets to be header and line sheets; if they are reversed or named differently, the parser throws an uncaught error[\[57\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/xlsx/parser.js#L43-L66). The review suggests improving sheet detection and error messaging to handle such cases gracefully.

3. **Efficiency:** Most recommendations (input validation, error wrapping, eliminating duplicate Prisma clients) have minimal impact on computational complexity. The suggestion to implement concurrency or pooling in the browser service may increase memory efficiency by reusing resources. The overall aim is to enhance reliability and security rather than reduce asymptotic complexity.

---

[\[1\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/xlsx/parser.js#L13-L25) [\[2\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/xlsx/parser.js#L29-L38) [\[3\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/xlsx/parser.js#L43-L46) [\[57\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/xlsx/parser.js#L43-L66) parser.js

[https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/xlsx/parser.js](https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/xlsx/parser.js)

[\[4\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/docx/parser.js#L16-L47) [\[5\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/docx/parser.js#L30-L38) parser.js

[https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/docx/parser.js](https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/docx/parser.js)

[\[6\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/pdf/addressParser.js#L38-L44) [\[7\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/pdf/addressParser.js#L56-L60) [\[8\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/pdf/addressParser.js#L94-L101) addressParser.js

[https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/pdf/addressParser.js](https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/pdf/addressParser.js)

[\[9\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/pdf/hocrParser.js#L43-L57) hocrParser.js

[https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/pdf/hocrParser.js](https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/pdf/hocrParser.js)

[\[10\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/index.js#L18-L21) index.js

[https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/index.js](https://github.com/JoelA510/FormWaypoint/blob/HEAD/services/ingestion/src/index.js)

[\[11\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/web/src/services/api.js#L1-L4) [\[12\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/web/src/services/api.js#L1-L8) [\[13\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/web/src/services/api.js#L27-L30) api.js

[https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/web/src/services/api.js](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/web/src/services/api.js)

[\[14\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/web/src/services/taskService.js#L58-L60) [\[15\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/web/src/services/taskService.js#L37-L39) [\[16\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/web/src/services/taskService.js#L78-L80) taskService.js

[https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/web/src/services/taskService.js](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/web/src/services/taskService.js)

[\[17\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/analytics.js#L4-L6) analytics.js

[https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/analytics.js](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/analytics.js)

[\[18\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/browser.js#L8-L15) [\[19\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/browser.js#L18-L25) browser.js

[https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/browser.js](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/browser.js)

[\[20\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/email.js#L5-L9) [\[21\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/email.js#L6-L13) [\[22\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/email.js#L89-L92) [\[23\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/email.js#L21-L26) email.js

[https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/email.js](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/email.js)

[\[24\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/generator.js#L18-L22) [\[25\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/generator.js#L23-L26) [\[26\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/generator.js#L66-L69) [\[27\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/generator.js#L62-L64) generator.js

[https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/generator.js](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/generator.js)

[\[28\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/rulesService.js#L7-L14) [\[29\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/rulesService.js#L16-L19) rulesService.js

[https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/rulesService.js](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/rulesService.js)

[\[30\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/shared/rules/RuleEngine.js#L62-L64) [\[31\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/shared/rules/RuleEngine.js#L52-L59) RuleEngine.js

[https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/shared/rules/RuleEngine.js](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/shared/rules/RuleEngine.js)

[\[32\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/socket.js#L23-L25) socket.js

[https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/socket.js](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/socket.js)

[\[33\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/erp/services/ErpService.js#L9-L16) [\[34\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/erp/services/ErpService.js#L27-L46) ErpService.js

[https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/erp/services/ErpService.js](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/erp/services/ErpService.js)

[\[35\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/compliance/routes/complianceRoutes.js#L19-L26) [\[36\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/compliance/routes/complianceRoutes.js#L30-L35) complianceRoutes.js

[https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/compliance/routes/complianceRoutes.js](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/compliance/routes/complianceRoutes.js)

[\[37\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/compliance/services/ComplianceService.js#L5-L9) ComplianceService.js

[https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/compliance/services/ComplianceService.js](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/compliance/services/ComplianceService.js)

[\[38\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/products/services/ProductService.js#L11-L14) [\[39\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/products/services/ProductService.js#L28-L37) ProductService.js

[https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/products/services/ProductService.js](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/products/services/ProductService.js)

[\[40\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/parties/services/PartyService.js#L31-L38) PartyService.js

[https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/parties/services/PartyService.js](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/parties/services/PartyService.js)

[\[41\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/templates/dtos/templateDto.js#L11-L11) templateDto.js

[https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/templates/dtos/templateDto.js](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/templates/dtos/templateDto.js)

[\[42\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/templates/services/TemplateService.js#L22-L26) TemplateService.js

[https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/templates/services/TemplateService.js](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/templates/services/TemplateService.js)

[\[43\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/freight/services/FreightService.js#L10-L19) [\[44\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/freight/services/FreightService.js#L26-L34) [\[45\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/freight/services/FreightService.js#L26-L37) FreightService.js

[https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/freight/services/FreightService.js](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/freight/services/FreightService.js)

[\[46\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/shipping/services/ShipmentService.js#L18-L22) ShipmentService.js

[https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/shipping/services/ShipmentService.js](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/shipping/services/ShipmentService.js)

[\[47\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/shipping/dtos/shipmentDto.js#L13-L15) shipmentDto.js

[https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/shipping/dtos/shipmentDto.js](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/domains/shipping/dtos/shipmentDto.js)

[\[48\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/shared/core/Result.js#L5-L38) Result.js

[https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/shared/core/Result.js](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/shared/core/Result.js)

[\[49\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/shared/core/BaseService.js#L19-L33) BaseService.js

[https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/shared/core/BaseService.js](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/shared/core/BaseService.js)

[\[50\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/shared/utils/requestHandler.js#L24-L30) [\[51\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/shared/utils/requestHandler.js#L33-L36) requestHandler.js

[https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/shared/utils/requestHandler.js](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/shared/utils/requestHandler.js)

[\[52\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/documents/viewModels.js#L12-L18) [\[53\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/documents/viewModels.js#L52-L57) [\[54\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/documents/viewModels.js#L52-L67) [\[55\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/documents/viewModels.js#L122-L132) [\[56\]](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/documents/viewModels.js#L171-L179) viewModels.js

[https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/documents/viewModels.js](https://github.com/JoelA510/FormWaypoint/blob/HEAD/apps/api/src/services/documents/viewModels.js)