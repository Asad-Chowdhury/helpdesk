# Inbound Parse fixtures

**Hand-authored from SendGrid's documented Inbound Parse field list — not captured from a
live delivery.** Nobody has a verified sending domain yet, so these encode what the docs
say, which is the best available evidence and is not the same as evidence.

Replace each one with a real capture the first time mail actually flows, and expect at
least one surprise: field names, charset handling and attachment part shapes are the usual
places docs and reality diverge.

Each file is the flat `Record<string, string>` a multipart POST decodes to.
