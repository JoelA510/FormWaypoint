# Refactor Summary: SEC-001 - Secure File Uploads

## Changes
- **Dependency Update**: Replaced `adm-zip` (synchronous, vulnerable) with `yauzl` (streaming, safe) and `file-type` (validated by magic numbers).
- **Security Logic**:
    - Implemented `apps/api/src/utils/fileValidation.js` to verify file signatures against an allowlist (`pdf`, `zip`, `png`, `jpeg`, etc.).
    - Refactored `apps/api/src/routes/upload.js` to use `yauzl` for ZIP extraction.
    - Added **Zip Slip** protection: Rejects any zip entry containing `..` or absolute paths.
- **Testing**:
    - Added `tests/upload_security.test.js` verifying:
        - Valid PDF upload (signature check).
        - Rejection of mismatched signatures (fake PDFs).
        - Rejection of malicious executables.
        - Rejection of Zip Slip attacks.
        - Successful processing of valid ZIPs.

## Verification
Run `npm test tests/upload_security.test.js` to verify all security constraints.
