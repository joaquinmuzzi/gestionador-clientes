# Security policy

## Supported versions

Gestionador de Clientes is a small project: only the latest code on `main` (and the deployment
built from it) receives fixes.

## How Gestionador de Clientes is exposed

The app holds the most sensitive data a support technician has: passwords, network layouts and
screenshots of the configurations of many companies. It runs on a self-hosted server with Docker
Compose; the app and Postgres listen on `127.0.0.1` and are meant to be reached through an HTTPS
reverse proxy. Every page needs a password and a TOTP code, secrets are encrypted in the
application with a key that never enters the database, and there is no sign-up page.

Examples of problems we want to hear about:

- reaching any page, Server Action or file without a valid session, or keeping a session alive
  after logout, expiry or a password or 2FA reset;
- bypassing the second factor, replaying a TOTP code or getting around the login rate limit;
- reading a secret or an attachment in clear text from the database, the logs or a response that
  should not include it, or decrypting it outside its context;
- cross-site scripting, cross-site request forgery, clickjacking or SQL injection;
- a vulnerable dependency that the app actually uses in a vulnerable way.

## Reporting a vulnerability

Please **do not open an issue**. Report it privately to the maintainer,
[@joaquinmuzzi](https://github.com/joaquinmuzzi), or draft a
[security advisory](https://github.com/joaquinmuzzi/gestionador-clientes/security/advisories/new)
if you have access to the repository.

Include what you found, how to reproduce it, and what an attacker could do with it. Never include
real customer data or credentials in the report. You will get an answer within 7 days.
