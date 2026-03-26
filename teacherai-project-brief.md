# TeacherAI — Project Brief v3.8
*Last updated: March 26, 2026*

## QUICK START FOR NEW SESSION
Upload this file + index.html to Claude. Say: "Continue building TeacherAI. Read the brief first."

## CRITICAL OPEN BUG — FIX THIS FIRST
**Class switching broken** — switching classes in Class Roster and Generate tab doesn't update students/grades.

Root cause: Supabase query builder chaining. This pattern is WRONG:
```js
const q = db.from('students').select('*')
if (activeClassId) q.eq('class_id', activeClassId)  // doesn't mutate q!
await q  // fetches without filter
```
Must be:
```js
let q = db.from('students').select('*')
if (activeClassId) q = q.eq('class_id', activeClassId)  // reassign
await q
```

Fix applied to `loadUserData()` and `switchClass()` but bug persists. Debug logging added to `switchClass()`. Next step: deploy, open browser console (F12), click between classes, read what's logged.

---

## PRODUCT
**TeacherAI** — AI teaching OS for Ontario SSC/split-grade teachers
**Live:** teacherai.ca | 
**GitHub:** github.com/mrtanallan/TeacherAI
**Version:** v3.8 · Mar 26 2026 (check footer after login to confirm deploy)

## STACK
- Frontend: single HTML file `public/index.html` (~290KB) — **too large for GitHub web editor, must use file upload**
- Backend: Vercel serverless `api/generate.js` + `api/worksheet.js`
- DB: Supabase (bbhhkyiyfybmlfkerfto.supabase.co, Canada Central)
- Auth: Supabase (email/password + Google OAuth)
- AI: claude-sonnet-4-20250514

## vercel.json
```json
{
  "routes": [
    { "src": "/api/generate", "dest": "/api/generate.js" },
    { "src": "/api/worksheet", "dest": "/api/worksheet.js" },
    { "src": "/ws", "dest": "/public/worksheet.html" },
    { "src": "/(.*)", "dest": "/public/index.html" }
  ]
}
```

## DATABASE TABLES
- `profiles` — teacher accounts
- `classes` — (id, teacher_id, name, subject_focus, context)
- `students` — (id, teacher_id, class_id, first_name, last_name, grade, notes, learning_profile, previous_class_name)
- `lessons` — (id, teacher_id, topic, grades[], subject, content jsonb, expectations jsonb, class_id)
- `worksheets` — (id, teacher_id, lesson_id, topic, grades[], content, roster jsonb, class_id)
- `worksheet_submissions` — (id, worksheet_id, student_name, student_id, responses jsonb, submitted_at)
- `assessment_sessions` — (id, teacher_id, task, subject, strand, grades[], date, class_id, expectations jsonb)
- `student_marks` — (id, session_id, student_id, level, notes)
- `report_card_comments` — (id, teacher_id, student_id, term, subject, comment, char_limit, updated_at) UNIQUE(teacher_id, student_id, term, subject)

**SQL migrations (run in Supabase SQL editor if not done):**
- `add-class-id-to-lessons.sql`
- `create-report-card-comments-table.sql`

## CURRENT UI (v3.8 Generate form)
1. Class · Subject · Duration — compact top row
2. Grade pills — K · Gr.1–Gr.8, tap multiple for split class
3. "What are you teaching?" — big hero input
4. What to Generate — chip checkboxes
5. ⚙️ More options — collapsible, localStorage state, contains Strands (A→B→C→D, all unchecked) + Target Expectations

## KEY GOTCHAS
- Supabase query builder: MUST reassign `q = q.eq(...)` not `q.eq(...)`
- `authFetch()` refreshes JWT if expiring within 60s
- Duration labels: "1 lesson" / "3 lessons" / "5 lessons" → normalised in prompt
- Strands use Ontario 2023 names: A=Literacy Connections, B=Foundations of Language, C=Comprehension, D=Composition
- Student names anonymized before Anthropic API (never sends real names)
- `teacherai_moreopts` localStorage for More Options state
- `teacherai_welcomed` localStorage for onboarding dismissed state
- Footer version number confirms correct deploy

## DEPLOYMENT
1. Download index.html from Claude outputs
2. GitHub → public/ → Add file → Upload files
3. Wait for green checkmark (~30-45s)
4. Hard refresh (Cmd+Shift+R)
5. Check footer shows v3.8

## FEATURES LIVE
- Full lesson generation (lesson plan, worksheet, reading resource, rubric, differentiation)
- Grade pills for single/split grade selection
- Ontario 2023 curriculum expectations (96 embedded, strands A/B/C/D)
- Target expectations: hard requirement + "focus only" mode
- Student worksheet delivery (combined link for split, per-grade links)
- Fuzzy name matching on worksheet submission
- Auto-marking of submitted worksheets
- Assessment tab: Level 1-4 per student, observation notes
- Grade tracker with CSV export
- Expectations tracker
- Report Cards: AI-generated Ontario-style comments, auto-save to Supabase, Copy All
- My Lessons: search, bulk delete, reload past lesson
- Google OAuth login
- Password reset
- Account page
- Toast notifications (lesson saved, assessment saved)
- Onboarding banner (2 steps, dismisses after students + first lesson)

## WHAT'S NOT BUILT YET
- Stripe subscription/payments
- Mobile-first polish
- React rewrite
- Math/Science curriculum
- Unit plan generation (duration beyond 5 lessons)
