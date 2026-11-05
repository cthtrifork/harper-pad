package admin

// The tests in package admin_test need the CSRF cookie name; they live outside this package so they can use internal/store, which
// imports it.
const CSRFCookie = csrfCookie
