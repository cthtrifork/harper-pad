-- The device's DPoP key is stored as its RFC 7638 thumbprint, not as a JWK: the proof carries the key itself, and the signature is
-- verified against it, so the server only needs to know which key the device enrolled with. The column is empty or unused before
-- the first enrollment, so renaming it loses nothing. The grants to harper_admin (select and delete on devices, update on name) are
-- on the table and the name column and are not affected.
ALTER TABLE devices RENAME COLUMN public_key TO key_thumbprint;
