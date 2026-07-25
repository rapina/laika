# Security policy

## Reporting a vulnerability

Do not include secrets, personal data, exploit details, or production access
information in a public issue.

Use GitHub's private vulnerability reporting feature for this repository. If
that feature is unavailable, contact the repository owner through a private
channel listed on their GitHub profile.

Include:

- the affected repository and commit;
- the smallest reproducible example;
- the expected and observed impact; and
- whether production data or credentials may be exposed.

Do not access, modify, or retain data that is not yours. Give the maintainers a
reasonable opportunity to investigate before publishing details.

## Supported versions

Only the current default branch and the version deployed at
<https://laika365.vercel.app> receive security fixes.

## Secrets

Local `.env*` files, Vercel credentials, and the Supabase service-role key must
never be committed. A Supabase publishable key may appear in browser code; its
permissions must still be constrained by Row Level Security.
