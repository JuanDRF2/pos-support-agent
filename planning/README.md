# Planning — pos-support-agent

A normal, visible folder for the **human inputs** to planning — things you bring to the
table before work is shaped. It holds two things:

- **design/** — design references: Figma links, Lovable projects, screenshots, brand, or a
  site to emulate. Drop images here; paste links where they're asked for.
- **imported/** — already have planning done (a spec, PRD, notes, a doc)? Put it here and tell
  Claude. It will review and reconcile that work instead of starting over.

**Where the actual plan lives:** each piece of work is an *initiative* under
`openspec/changes/<id>/` — its proposal, acceptance criteria, tasks, and the loop-contract
you sign off on. That folder, plus `npm run genesis -- board`, is the project's plan and its
history. You'll be walked through every initiative and asked for changes before code is written.
