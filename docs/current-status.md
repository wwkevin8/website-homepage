# Current Status

## Document Rules

- Read this file together with `E:\webside\AGENTS.md` before analysis or implementation.
- Keep this document as the latest handoff snapshot; rewrite outdated sections instead of appending session logs.

## Last Updated Task

- Date: 2026-05-09
- Scope: align storage and pickup mobile menus to the two-column service-card style

## Completed In This Task

- Read `E:\webside\AGENTS.md` and `E:\webside\docs\current-status.md` before making changes.
- Read `C:\Users\75262\.agents\skills\ui-ux-pro-max\SKILL.md` for the requested mobile UI refinement.
- Re-aligned the shared public mobile service menu style so both storage and pickup menus use the requested `2 + 2 + 1` card layout: two cards per row and a full-width `联系我们` card.
- Added a shared CSS-only storage icon for the `寄存服务` mobile menu card so the pickup page can use the same visual system without page-specific icon overrides.
- Updated `pickup.html` and `storage.html` stylesheet cache-bust query strings so browsers request the latest shared menu CSS.
- Committed the mobile menu correction to GitHub before deployment, preserving the required GitHub-then-Vercel release order.
- Commit `593aee8` (`Restore mobile menu grid style`) was pushed to `origin/codex/full-sync`.
- Ran production build and production deploy for the corrected storage and pickup mobile menu style.
- Production deployment `dpl_6BYYJoGp2kqyGto6qWd11NUGVxcs` completed successfully and was aliased to `https://ngn.best`.
- No backend API, admin page, database, SQL, email, package, dependency, payment, or deployment configuration code was changed for this menu correction.
- Added mobile-specific visual and spacing overrides for the public storage page in `styles.css`.
- Reworked the mobile storage first screen so the main storage copy leads the page, with the service video kept as a smaller supporting media block below it.
- Tightened mobile typography, spacing, feature pills, process steps, box price cards, calculator fields, estimate results, and storage rules floating action button placement.
- Hid the large desktop login button in the storage mobile header; the login action remains available inside the mobile menu.
- Prevented the storage intro modal from auto-opening on phone widths so mobile users land directly on the storage page instead of a blocking dialog.
- Updated `storage.html` stylesheet and script cache-bust query strings so browsers request the new public storage page assets.
- Refined the public storage intro modal after mobile visual review: reduced headline and card typography, removed the `今日建议` panel, removed the `下一步会发生什么` explanatory block, and changed the four process steps to a fully visible 2x2 grid on mobile.
- Reworked the storage intro modal's two bottom CTA buttons into richer information CTAs with custom CSS icons, supporting copy, directional affordances, hover/focus/press feedback, and clearer primary/secondary hierarchy.
- Updated the storage intro modal CTA colors to two distinct light pastel rainbow gradients, reduced the CTA copy size, centered the mobile modal vertically, and removed the temporary `我已知晓` action per the latest request.
- Fixed the public storage mobile hero so the service video no longer appears above the main storage copy; the text card now leads the first screen and the video is a smaller rounded media block below it.
- Reduced the mobile storage hero title, highlight, body, feature-card, meta, and hero button typography so the first screen feels less oversized on phone widths.
- Refined the public storage mobile process section: reduced the process heading and card typography, shrank the process icons, moved step numbers into the text column, and removed the mobile icon/text overlap.
- Refined the public storage mobile box pricing section so the six box-size cards use a compact two-column layout with smaller icons, tighter type, shorter price blocks, and reduced spacing to fit the section close to one phone viewport.
- Refined the public storage mobile calculator so the form uses compact two-column fields, hides long helper text on phone widths, keeps box type controls tighter, and shows the estimate result as compact two-column metric cards.
- Hid the calculator examples on phone widths to keep the calculator focused and much shorter without changing calculation logic.
- Reduced the public storage mobile calculator input typography for date fields, selects, numeric inputs, and submit text while keeping touch targets usable.
- Restored a compact mobile-only blocked-calculation reason under the estimate result when the calculator cannot produce a total, while keeping normal calculated notes collapsed.
- Further reduced the mobile text size for the pickup method, return type, and delivery method select controls.
- Restored the mobile result-side booking entry card so users can still access the storage booking and storage return registration flows from the calculator area, using a compact two-button layout.
- Center-aligned the mobile booking and return-registration entry button text inside the calculator result area.
- Refined the public storage mobile rules and notes section with smaller headings, tighter rule cards, compact discount cards, and reduced table spacing.
- Changed the public storage mobile rule cards into individual disclosure cards: each rule now shows a compact `查看详情` button by default and expands only when tapped, while desktop keeps the full rule text visible.
- Kept the storage intro modal's existing CTA targets and step selection behavior; no order flow or calculator logic was changed.
- Reduced the public storage mobile long-term discount tier typography and card height without adding a disclosure interaction, so all discount tiers remain visible but read lighter.
- Refined the public storage mobile calculation example table so the `计算方式` column wraps inside the viewport, the table no longer requires horizontal scrolling, and the example text uses a smaller mobile type scale.
- Refined the public storage mobile header to match the pickup page pattern more closely: the auth/login area now stays in the top-right header beside the menu button.
- Updated the public storage mobile menu so `其他服务` is no longer a single link to the booking homepage; it now exposes separate `订房主页` and `接送机服务` entries while keeping `说明`.
- Reworked the public storage mobile menu into richer service cards with lightweight CSS icons, subtitles, arrows, pressed/focus states, and a softer glass panel background.
- Made the public storage mobile header fixed at the top during scroll and added mobile scroll offsets so anchor targets are not hidden behind the header.
- Reduced the public storage mobile footer typography and spacing for the brand text, contact cards, business hours, address, contact links, and copyright line.
- No backend API, admin page, database, SQL, email, package, dependency, payment, or deployment action was performed.
- Refined the public storage booking page on mobile: reduced the booking/return form title, profile-gate, field label, input, textarea, select, notice toggle, radio, and submit button typography/spacing.
- Hid the non-editable account contact information section on mobile so the writable booking/return fields move much higher on the page while the submitted profile values remain part of the form data.
- Hid mobile-only helper microcopy inside the booking/return form and kept the required order notice confirmation visible in a compact two-choice layout.
- Hid the booking page side summary on mobile so users go directly into the form instead of scrolling through secondary explanation content.
- Updated `storage-booking.html` stylesheet cache-bust query string so browsers request the latest compact booking form CSS.
- No backend API, admin page, database, SQL, email, package, dependency, payment, or deployment action was performed for the booking form density pass.
- Refined the public storage order receipt modal on mobile so the submitted-order ticket opens as a centered rounded card instead of a full-screen sheet.
- Reduced the mobile receipt header, order number block, summary rows, customer-service contact block, QR code, footnote, and sticky confirmation button sizing.
- Updated `storage-booking.html` stylesheet cache-bust query string so browsers request the latest compact receipt modal CSS.
- No backend API, admin page, database, SQL, email, package, dependency, payment, or deployment action was performed for the receipt modal pass.
- Reduced the public storage mobile FAQ / price-rules modal typography and spacing: smaller modal heading, FAQ card title, list items, table text, and tighter modal content padding.
- Updated `storage.html` stylesheet cache-bust query string so browsers request the latest public storage modal CSS.
- No backend API, admin page, database, SQL, email, package, dependency, payment, or deployment action was performed for the FAQ modal pass.
- Refined the mobile personal center (`service-center.html`) with a compact header card, smaller title, tighter quick-service actions, a horizontal user summary, two-column primary actions, and a 2x2 profile-completion status strip.
- Reduced mobile personal center overview cards, pending-task cards, recent-record panels, more-service links, and order-detail modal typography/spacing so the page is less oversized on phones.
- Refined the mobile personal profile form (`profile.html`) with smaller header, compact input fields, compact contact-preference pills, and shorter form actions.
- Fixed profile hidden contact fields so `hidden` profile fields cannot be forced visible by the shared `.field` display rule during initial render.
- Updated `service-center.html` and `profile.html` stylesheet cache-bust query strings so browsers request the latest personal-center CSS.
- No backend API, admin page, database, SQL, email, package, dependency, payment, or deployment action was performed for the personal center mobile pass.
- Reduced the mobile personal center and personal profile typography one more step across titles, quick links, profile summary, status chips, service cards, panels, tasks, detail modal, form labels, inputs, helper text, and buttons.
- Updated `service-center.html` and `profile.html` stylesheet cache-bust query strings again so browsers request the smaller mobile typography CSS.
- No backend API, admin page, database, SQL, email, package, dependency, payment, or deployment action was performed for the personal center typography pass.
- Restored a mobile NGN brand header on `service-center.html` and `profile.html` so personal center pages again have a visible top brand bar.
- Added mobile-only sticky styling for the personal center NGN header while keeping desktop unaffected.
- Updated `service-center.html` and `profile.html` stylesheet cache-bust query strings so browsers request the restored mobile header CSS.
- No backend API, admin page, database, SQL, email, package, dependency, payment, or deployment action was performed for the personal center header pass.
- Stabilized the public homepage mobile first paint: reserved the mobile header/auth area height, kept the homepage menu explicitly hidden before initialization, constrained the mobile menu height, and capped the mobile hero first-screen height.
- Added a small critical inline homepage style block for `[hidden]`, the mobile topbar, auth placeholder, and hidden menu state so the first render frame is stable before the external stylesheet finishes loading.
- Updated `index.html` stylesheet and script cache-bust query strings so browsers request the latest homepage assets.
- Replaced homepage `????????` fallback text with the same Chinese copy that JavaScript applies after initialization, removing another visible text/layout swap during first paint.
- Verified `https://ngn.best/` is still serving the old `20260505-cache-bust-1` homepage assets, so the production site will still show the old flash until this working tree is deployed.
- No backend API, admin page, database, SQL, email, package, dependency, payment, or deployment action was performed for the homepage first-paint pass.
- Refined the public pickup mobile header menu from oversized plain text rows into compact 2-column service cards with lightweight CSS icons, subtitles, chevrons, pressed/focus states, and a full-width contact card.
- Updated `pickup.html` stylesheet cache-bust query strings so browsers request the latest pickup menu CSS.
- No backend API, admin page, database, SQL, email, package, dependency, payment, or deployment action was performed for the pickup mobile menu pass.
- Made the public pickup mobile header fixed at the top while scrolling, added mobile page top spacing, and added scroll margins for pickup section anchors so fixed header coverage is avoided.
- Updated `pickup.html` stylesheet cache-bust query strings again so browsers request the latest fixed-header pickup CSS.
- No backend API, admin page, database, SQL, email, package, dependency, payment, or deployment action was performed for the pickup fixed-header pass.
- Ran a production Vercel build and production deploy for the accumulated mobile public-page UI updates.
- Production deployment `dpl_3yGfRh5k3dnb1c9vVrBjF342JBTt` completed successfully and was aliased to `https://ngn.best`.
- The production deployment URL is `https://webside-oyslmfewu-wwkevin8s-projects.vercel.app`; direct deployment URL access returned 401, while the production alias is public and verified.
- No backend API, admin page, database, SQL, email, package, dependency, or payment code was changed during the deployment step.
- Changed the public storage intro modal to auto-open on mobile as well as desktop so students see the storage flow guidance when entering the storage page.
- Updated `storage.html` script cache-bust query string so browsers request the latest storage intro modal behavior.
- No backend API, admin page, database, SQL, email, package, dependency, payment, or deployment action was performed for the storage intro modal auto-open change.
- Corrected the release ordering after deployment by committing the accumulated mobile UI changes to Git and pushing them to GitHub branch `codex/full-sync`.
- Commit `e2155cd` (`Polish mobile storage and pickup UI`) is now on `origin/codex/full-sync`.
- GitHub CLI is not installed in the local environment, so no pull request was opened from this machine.
- Updated the public pickup mobile menu to use the same single-column `storage-mobile-menu-card` structure and visual style as the storage mobile menu.
- Added a matching CSS-only storage/box icon for the pickup page's `寄存服务` menu item.
- Updated `pickup.html` stylesheet cache-bust query strings so browsers request the latest pickup menu alignment CSS.
- No backend API, admin page, database, SQL, email, package, dependency, payment, or deployment action was performed for the pickup mobile menu alignment pass.
- Committed the pickup mobile menu alignment changes to GitHub before deployment, preserving the required GitHub-then-Vercel release order.
- Commit `062eab1` (`Align pickup mobile menu with storage`) was pushed to `origin/codex/full-sync`.
- Ran production build and production deploy for the pickup mobile menu alignment change.
- Production deployment `dpl_AgaKdkshWPRZrGLK6HEapr7p2KHG` completed successfully and was aliased to `https://ngn.best`.

## Verification

- `node --check script.js` passed after the shared mobile menu correction.
- Local helper server served `http://localhost:3000/pickup` and `http://localhost:3000/storage` with HTTP 200.
- Playwright checked `http://localhost:3000/pickup` at a 390px mobile viewport and confirmed the menu opens as two 162px columns plus a 332px full-width contact card, has five cards, the header remains fixed at top 0 after scrolling, and there is no horizontal overflow.
- Playwright checked `http://localhost:3000/storage` at a 390px mobile viewport and confirmed the menu opens as two 150px columns plus a 308px full-width contact card, has five cards, the header remains fixed at top 0 after scrolling, and there is no horizontal overflow.
- `npm run build:prod` completed successfully.
- `npm run deploy:prod` completed successfully and aliased the deployment to `https://ngn.best`.
- Production verification passed: `https://ngn.best/`, `https://ngn.best/storage`, and `https://ngn.best/pickup` returned HTTP 200.
- Production verification passed: `https://ngn.best/storage.html` and `https://ngn.best/pickup.html` returned HTTP 308 redirects to `/storage` and `/pickup`.
- Production asset verification passed: both `https://ngn.best/pickup` and `https://ngn.best/storage` reference `20260509-mobile-menu-grid-1`.
- Playwright checked `https://ngn.best/pickup` at a 390px mobile viewport and confirmed the menu opens as two 162px columns plus a 332px full-width contact card, the header remains fixed at top 0 after scrolling, and there is no horizontal overflow.
- Playwright checked `https://ngn.best/storage` at a 390px mobile viewport and confirmed the menu opens as two 150px columns plus a 308px full-width contact card, the header remains fixed at top 0 after scrolling, and there is no horizontal overflow.
- `node --check script.js` passed.
- Local helper server served `http://localhost:3000/storage` with HTTP 200.
- Playwright opened `http://localhost:3000/storage` at a 390px mobile viewport.
- Playwright confirmed the storage intro modal stays hidden on mobile, the page has no horizontal overflow, and the mobile header auth nav is hidden while the hamburger menu is visible.
- Playwright clicked the storage mobile menu and confirmed it opens with links including `登录`.
- Playwright captured mobile screenshots for the top of the storage page and calculator section under `output/`.
- Playwright opened the storage intro modal at a 390px mobile viewport and confirmed all four process cards are visible, there is no horizontal overflow, and the removed `今日建议` / `下一步会发生什么` blocks are absent.
- Playwright opened the storage intro modal at a 1024px desktop viewport and confirmed the modal still auto-opens, all four process cards are visible, and clicking a step updates the active state.
- Playwright verified the refreshed storage intro CTA buttons at 390px mobile and 1024px desktop widths; both render without horizontal overflow and preserve accessible tap heights.
- Playwright rechecked the final pastel CTA and centered-modal pass at 390px mobile and 1024px desktop widths; both buttons render without horizontal overflow, and the modal has no `我已知晓` action.

- Playwright rechecked the storage hero at a 390px mobile viewport: the text card starts above the video, the video sits below at a reduced height, the title is about 32px, and there is no horizontal overflow.
- Playwright rechecked the storage hero at a 1024px desktop viewport and confirmed there is no horizontal overflow.
- Playwright rechecked the storage process section at a 390px mobile viewport and confirmed the process cards have no icon, number, title, or body overlap and no horizontal overflow.
- Playwright rechecked the storage process section at a 1024px desktop viewport and confirmed there is no horizontal overflow.
- Playwright rechecked the storage box pricing section at a 390px mobile viewport and confirmed six cards render in two columns, the card grid is about 491px tall, the section is about one viewport tall, and there is no horizontal overflow.
- Playwright rechecked the storage box pricing section at a 1024px desktop viewport and confirmed there is no horizontal overflow.
- Playwright rechecked the storage calculator at a 390px mobile viewport and confirmed no horizontal overflow, compact two-column form/result layouts, hidden helper/example/booking-extra blocks, and a form height of about 749px.
- Playwright rechecked the storage calculator at a 1024px viewport and confirmed there is no horizontal overflow.
- Playwright rechecked the storage calculator inputs at a 390px mobile viewport and confirmed date text is about 12.5px, select and numeric input text is about 13px, input heights remain about 40px, and there is no horizontal overflow.
- Playwright rechecked the storage calculator at a 390px mobile viewport with a blocked estimate and confirmed `不可计算` shows a visible reason message, while normal calculated estimates keep the note hidden.
- Playwright rechecked the three storage calculator service selects at a 390px mobile viewport and confirmed their text is about 11.5px with no horizontal overflow.

- Playwright rechecked the storage calculator at a 390px mobile viewport and confirmed the mobile booking entry card is visible with two actions and no horizontal overflow.
- Playwright rechecked the mobile booking entry buttons at a 390px viewport and confirmed both button labels are center-aligned with no horizontal overflow.
- Playwright rechecked the storage rules section at a 390px mobile viewport and confirmed there is no horizontal overflow, the rule cards and discount cards use compact mobile typography, and discount cards render in two columns.
- Playwright rechecked the storage rules section at a 1024px viewport and confirmed there is no horizontal overflow.
- Playwright rechecked the storage rules disclosures at a 390px mobile viewport and confirmed four `查看详情` buttons render, rule paragraphs are hidden by default, tapping the first rule expands only that rule, the button changes to `收起详情`, and there is no mobile horizontal overflow.
- Playwright rechecked the storage rules section at a desktop width and confirmed full rule paragraphs remain visible and the disclosure buttons stay hidden.

- Playwright rechecked the long-term discount tiers at a 390px mobile viewport and confirmed all six discount cards remain visible, no discount disclosure button is present, the tier title is about 14px, tier range text about 9px, discount numbers about 14px, and there is no mobile horizontal overflow.
- Playwright rechecked the long-term discount tiers at a desktop width and confirmed all six discount cards still render.
- Playwright rechecked the calculation example table at a 390px mobile viewport and confirmed the table wrapper and table are both 338px wide, no horizontal table scrolling is needed, the calculation text is about 9px, and the page has no mobile horizontal overflow.
- Playwright rechecked the calculation example table at a desktop width and confirmed the desktop table keeps its existing width behavior.

- Playwright rechecked the public storage header at a 390px mobile viewport and confirmed the header auth area is visible, the mobile menu opens, `说明` remains present, `其他服务` is not a direct homepage link, and the menu contains separate `订房主页` and `接送机服务` links with no horizontal overflow.
- Playwright rechecked the public storage header at a desktop width and confirmed the existing dropdown still contains `订房主页` and `接机服务`, with the auth area visible.

- Playwright rechecked the refreshed public storage mobile menu at a 390px viewport and confirmed five 64px service cards render, subtitles do not overflow, the menu stays within the 390px viewport, and there is no horizontal overflow.
- Playwright rechecked the public storage fixed header at a 390px mobile viewport after scrolling: the topbar remains at top 0, uses `position: fixed`, keeps z-index 1300, the menu opens below the header, anchor navigation leaves space below the 77px header, and there is no horizontal overflow.
- Playwright rechecked the public storage footer at a 390px mobile viewport and confirmed the contact value text is about 13px, labels and copyright are about 10.5px, the first footer card is about 142px tall, and there is no horizontal overflow.
- `node --check script.js` passed after the booking form density changes.
- Local helper server served `http://localhost:3000/storage-booking.html?service=storage_return` and `http://localhost:3000/storage-booking.html?service=storage_collection` with HTTP 200.
- Playwright rechecked `storage-booking.html?service=storage_collection` at a 390px mobile viewport and confirmed no horizontal overflow, side summary hidden, readonly account section hidden, order notice visible, writable service section about 239px tall, full form about 452px tall, input text about 10.6px, labels about 9.9px, and submit text about 12.2px.
- Playwright rechecked `storage-booking.html?service=storage_return#storage-return-form` at a 390px mobile viewport and confirmed no horizontal overflow, side summary hidden, readonly account section hidden, order notice visible, writable service section about 383px tall, full form about 596px tall, input text about 10.6px, labels about 9.9px, and submit text about 12.2px.
- `node --check script.js` passed after the receipt modal density changes.
- Local helper server served `http://localhost:3000/storage-booking.html?service=storage_collection` with HTTP 200.
- Playwright simulated the submitted storage receipt modal at a 390px mobile viewport and confirmed no horizontal overflow, the modal renders as a centered 362px wide rounded card, max height is about 660px instead of full viewport height, receipt row text is about 11.2px, rows are about 25px tall, and the QR code is reduced to about 148px.
- `node --check script.js` passed after the FAQ modal typography changes.
- Local helper server served `http://localhost:3000/storage` with HTTP 200.
- Playwright opened the storage FAQ / price-rules modal from the right-bottom floating button at a 390px mobile viewport and confirmed no horizontal overflow, modal width about 362px, modal title about 20.5px, FAQ card title about 13.1px, FAQ list text about 10.9px, and table text about 9.9px.
- `node --check service-center.js` and `node --check profile.js` passed after the personal center mobile changes.
- Local helper server served `http://localhost:3000/service-center.html` and `http://localhost:3000/profile.html` with HTTP 200.
- Playwright checked `service-center.html` at a 390px mobile viewport and confirmed no horizontal overflow, the main header card is about 386px tall instead of the previous roughly 893px, the quick nav is about 80px tall, the profile area about 60px tall, and the status strip about 94px tall.
- Playwright checked `profile.html` at a 390px mobile viewport and confirmed no horizontal overflow, the top card is about 180px tall, the compact profile form card is about 355px tall before JS unhides the selected contact field, and hidden contact fields stay hidden during initial render.
- `node --check service-center.js` and `node --check profile.js` passed after the personal center typography reduction.
- Local helper server served `http://localhost:3000/service-center.html` and `http://localhost:3000/profile.html` with HTTP 200.
- Playwright checked both pages at a 390px mobile viewport and confirmed no horizontal overflow; personal center title is about 16.8px, quick/action button text about 9.9px, status text about 9.6px, service-card title about 10.6px, profile form labels about 9.6px, and profile input text about 9.9px.
- `node --check service-center.js` and `node --check profile.js` passed after restoring the personal center mobile header.
- Local helper server served `http://localhost:3000/service-center.html` and `http://localhost:3000/profile.html` with HTTP 200.
- Playwright checked both pages at a 390px mobile viewport and confirmed no horizontal overflow, the mobile NGN header displays at the top with sticky positioning, the header height is about 62px, and the first content card starts below it.
- `node --check script.js` passed after the homepage first-paint stabilization.
- Local helper server served `http://localhost:3000/` with HTTP 200.
- Playwright checked `http://localhost:3000/` at a 390px mobile viewport and confirmed no horizontal overflow, the homepage menu remains hidden, the mobile topbar height stays stable at about 69px from initial load, and the hero starts below the topbar.
- Playwright rechecked the homepage at a 390px mobile viewport after replacing fallback text and confirmed the hero title/subtitle, topbar height, hero position, and hero height stay unchanged from initial load through 1 second.
- `node --check script.js` passed after the pickup mobile menu changes.
- Local helper server served `http://localhost:3000/pickup` with HTTP 200.
- Playwright checked the pickup page at a 390px mobile viewport after closing the intro modal and confirmed the refreshed mobile menu opens, uses two 166px columns plus a full-width contact card, menu height is about 220px, title text is about 13px, subtitle text is about 9px, no menu labels overflow, and there is no horizontal overflow.
- Playwright checked the pickup page at a 1024px desktop viewport and confirmed the desktop nav remains visible, the mobile menu toggle stays hidden, the mobile menu remains closed, and there is no horizontal overflow.
- `node --check script.js` passed after the pickup fixed-header change.
- Local helper server served `http://localhost:3000/pickup` with HTTP 200.
- Playwright checked the pickup page at a 390px mobile viewport and confirmed the header uses `position: fixed`, stays at top 0 after scrolling, keeps z-index 1300, the page has 70px top padding, the menu still opens from the fixed header, and there is no horizontal overflow.
- Playwright checked the pickup page at a 1024px desktop viewport and confirmed the topbar remains `position: sticky`, page top padding remains unchanged, desktop nav remains visible, the mobile toggle remains hidden, and there is no horizontal overflow.
- `node --check script.js`, `node --check service-center.js`, and `node --check profile.js` passed before deployment.
- `npm run build:prod` completed successfully.
- `npm run deploy:prod` completed successfully and aliased the deployment to `https://ngn.best`.
- Production verification passed: `https://ngn.best/`, `https://ngn.best/storage`, and `https://ngn.best/pickup` returned HTTP 200.
- Production verification passed: `https://ngn.best/index.html`, `https://ngn.best/storage.html`, and `https://ngn.best/pickup.html` returned HTTP 308 redirects to `/`, `/storage`, and `/pickup`.
- Production asset verification passed: `https://ngn.best/pickup` references `20260509-pickup-sticky-1`, and the deployed `styles-pickup-backup.css` contains the fixed pickup header and mobile pickup menu CSS.
- Playwright checked `https://ngn.best/pickup` at a 390px mobile viewport and confirmed the pickup header is fixed at top 0 after scrolling, z-index is 1300, the refreshed menu opens with five cards, menu height is about 220px, and there is no horizontal overflow.
- `node --check script.js` passed after enabling storage intro modal auto-open on mobile.
- Local helper server served `http://localhost:3000/storage` with HTTP 200.
- Playwright checked `http://localhost:3000/storage` at a 390px mobile viewport and confirmed the storage intro modal auto-opens, renders as a 366px wide centered dialog, locks body scrolling, and has no horizontal overflow.
- Playwright checked `http://localhost:3000/storage` at a 1024px desktop viewport and confirmed the storage intro modal still auto-opens and has no horizontal overflow.
- `git commit -m "Polish mobile storage and pickup UI"` completed successfully with commit `e2155cd`.
- `git push -u origin codex/full-sync` completed successfully and updated GitHub from `a8f7b5a` to `e2155cd`.
- `node --check script.js` passed after aligning the pickup mobile menu with the storage style.
- Local helper server served `http://localhost:3000/pickup` with HTTP 200.
- Playwright checked the pickup page at a 390px mobile viewport and confirmed the menu opens as five single-column cards, uses one 332px column, card titles/subtitles do not overflow, the header remains fixed, and there is no horizontal overflow.
- Playwright checked the pickup page at a 1024px desktop viewport and confirmed desktop nav remains visible, the mobile toggle remains hidden, the menu remains closed, and there is no horizontal overflow.
- `git commit -m "Align pickup mobile menu with storage"` completed successfully with commit `062eab1`.
- `git push -u origin codex/full-sync` completed successfully and updated GitHub from `2cc6541` to `062eab1`.
- `npm run build:prod` completed successfully.
- `npm run deploy:prod` completed successfully and aliased the deployment to `https://ngn.best`.
- Production verification passed: `https://ngn.best/`, `https://ngn.best/storage`, and `https://ngn.best/pickup` returned HTTP 200.
- Production verification passed: `https://ngn.best/index.html`, `https://ngn.best/storage.html`, and `https://ngn.best/pickup.html` returned HTTP 308 redirects to `/`, `/storage`, and `/pickup`.
- Playwright checked `https://ngn.best/pickup` at a 390px mobile viewport and confirmed the pickup menu opens as five single-column storage-style cards, uses one 332px column, contains no old `.pickup-mobile-menu-card` nodes, the header remains fixed, and there is no horizontal overflow.

## Current Project Status

- The transport dispatch app remains a static multi-page website plus Vercel serverless APIs.
- Production is live at `https://ngn.best`.
- Latest deployed production URL is `https://webside-gxzp3t9mf-wwkevin8s-projects.vercel.app`.
- Production is currently aliased to deployment `dpl_6BYYJoGp2kqyGto6qWd11NUGVxcs`.
- Latest production deployment followed the required GitHub-then-Vercel order; the deployed two-column mobile menu correction is captured in Git commit `593aee8` on branch `codex/full-sync`.
- Both public storage and pickup mobile menus now use the same requested `2 + 2 + 1` service-card layout with a fixed top header.
- The P0 root JSON exposure risk is mitigated in the current working tree by sanitization, deployment ignores, `.gitignore` rules, and removal from the Git index.
- The three JSON files are no longer tracked in the current Git index, and local copies remain ignored.
- Manual credential rotation is still required because previous values must be treated as potentially exposed and may remain in Git history.
- The P1 missing transport payment email module risk is locally mitigated by `api/_lib/transport-payment-email.js`.
- Transport payment email delivery now depends on configured Resend or SMTP environment variables and a recipient email on the transport request.
- The P1 deploy exposure risk for known root historical/backup HTML, JS, and CSS files is locally mitigated through explicit `.vercelignore` entries.
- `styles-pickup-backup.css` remains deployable because it is still an active dependency of `pickup.html`.
- The pickup service now has a clean public route configured as `/pickup`, with `/pickup.html` retained only as a redirected compatibility URL after deployment.
- The homepage, pickup page, and storage page now have clean public routes configured as `/`, `/pickup`, and `/storage`; `.html` URLs are retained as redirected compatibility URLs after deployment.
- All root HTML pages explicitly declare the site favicon; the root favicon files are present for browser fallback and use the existing NGN brand logo.
- The public storage page now has a first-pass mobile layout polish in the working tree; it has been verified locally but not deployed in this task.
- On mobile and desktop widths, the public storage intro modal now auto-opens when entering the storage page.
- The public storage intro modal has been simplified for mobile conversion: smaller typography, four visible process cards, no `今日建议` panel, and no extra next-step explanation block.
- The storage intro modal CTA area now presents a richer primary `开始估价预约` path and secondary `取寄存登记` path with supporting copy and custom CSS icons.
- The CTA palette is now two different light pastel rainbow gradients for the primary storage booking path and secondary return-registration path, with smaller copy and a centered mobile modal.
- On mobile widths, the public storage hero now keeps the main storage copy before the video and uses a smaller first-screen type scale.
- On mobile widths, the public storage process section now uses compact cards with smaller icons, smaller typography, and non-overlapping step numbers.
- On mobile widths, the public storage box pricing section now uses a compact two-column card layout intended to show all six specs with much less scrolling.
- On mobile widths, the public storage calculator now uses a compact two-column form and result layout, with long explanatory blocks hidden to keep the tool close to one-screen use.
- On mobile widths, the public storage calculator input text is now smaller while preserving usable input heights.
- On mobile widths, blocked storage calculator estimates now show a compact reason message instead of hiding the explanation.
- On mobile widths, the public storage calculator again shows compact booking and return-registration entry actions below the estimate result.
- On mobile widths, the public storage calculator booking entry labels are centered within their buttons.
- On mobile widths, the public storage rules and notes section now uses a denser card and table layout.
- On mobile widths, the public storage rule cards now use individual tap-to-open detail buttons so the section is less text-heavy on first view.
- On mobile widths, the public storage long-term discount tier cards now use a smaller type scale and shorter card height while staying fully visible.
- On mobile widths, the public storage calculation example table now fits inside the viewport without horizontal scrolling.
- On mobile widths, the public storage header now keeps login/profile controls in the top bar and uses explicit service links in the menu.
- On mobile widths, the public storage menu now uses icon-led service cards instead of plain grey menu rows.
- On mobile widths, the public storage top header now stays fixed while scrolling.
- On mobile widths, the public storage footer now uses smaller typography and tighter contact cards.
- On mobile widths, the public storage booking and return-registration page now uses a compact operation-focused form: side summary and readonly account details are hidden, the required notice is compact, and writable fields use smaller labels/inputs to fit much more of the form on screen.
- On mobile widths, the public storage submitted-order receipt now opens as a compact centered card with smaller receipt summary text and a reduced QR/contact section, while keeping internal scrolling for the full ticket.
- On mobile widths, the public storage FAQ / price-rules modal now uses a smaller type scale so the right-bottom FAQ panel feels less oversized.
- On mobile widths, the personal center and personal profile pages now use compact card, action, status, and form layouts designed for phone screens instead of the previous desktop-heavy stacking.
- On mobile widths, the personal center and personal profile pages now use a smaller typography scale throughout, matching the latest request to reduce overall text size.
- On mobile widths, the personal center and personal profile pages again show a sticky NGN brand header above the page content.
- On mobile widths, the homepage now reserves the header/auth area and hides the menu at first paint to avoid the brief full-screen flash when opening the booking homepage.
- The homepage first-paint fix has been deployed to production.
- On mobile widths, the public pickup page now uses the same single-column card-style header menu pattern as the public storage page.
- On mobile widths, the public pickup page now keeps the top header visible while scrolling.
- The P2 transport request status contract is partially aligned at the orders/admin statistics layer: transport requests now use `published`, `matched`, `closed` there.
- The P2 transport group API/listing fallback paths are partially aligned: edited group API endpoints no longer write `open`, and public joinable listing now uses `single_member` and `active`.
- The P2 transport group lifecycle helper now avoids new `open` writes and normalizes historical `open` reads to `active`.
- Supabase read-only verification found no current production data migration need for transport status cleanup.
- The local transport-flow QA now passes after making the admin requests search step wait for the page's AJAX filtering path.
- The admin change-password modal now has clearer client-side validation and a fallback for deep admin route 404s.
- Existing bootstrap admin accounts no longer have their password hash overwritten from `ADMIN_BOOTSTRAP_PASSWORD` during login.

## Open Issues Or Risks

- P0 follow-up: rotate any admin/ops credentials that may have appeared in the previous root JSON payload files.
- P0 follow-up: previous versions of the root JSON payload files may still exist in Git history.
- P0 follow-up: consider moving example payloads to `docs/examples/*.example.json` in a future task.
- P1 follow-up: run a focused API smoke test against `PATCH /api/transport-requests/:id` with safe test data and configured email variables.
- P1 follow-up: verify the next Vercel deployment does not include the newly excluded historical root files.
- P1 follow-up: rename `styles-pickup-backup.css` to a formal production filename in a separate task and update `pickup.html` at the same time.
- P2 follow-up: review the public storage mobile page and intro modal on a real iPhone/Android browser before deployment, especially video cropping, the fixed storage-rules button, and whether the modal should auto-open on desktop only.
- P2 follow-up: verify admin dashboard transport counts in a separate focused check.
- P2 follow-up: decide whether `api/_lib/transport.js` legacy `open` / `draft` normalization should remain as read compatibility or be narrowed in a future task.
- P2: `transport-public.previous-good.js` is captured HTML with old Vercel auth URLs/nonces.
- P3: `admin-storage.html` storage label issue needs runtime/browser confirmation before code changes.
- Exact production email provider mix remains unclear because code supports Resend and SMTP across different flows.
- Google/OAuth provider status is unclear from repo scan; `google-auth.js` and `auth-callback.html` exist but active provider settings are external.

## Recommended Next Steps

1. Review the storage and pickup mobile pages on a real phone before deployment, especially the fixed/sticky headers, menu cards, floating FAQ buttons, and modal behavior.
2. Continue mobile tuning for the pickup page if the next task is still focused on the接机 flow.
3. Rotate the admin and operations account passwords that may have appeared in the previous root JSON payload files.
4. Decide whether local root payload files should eventually be replaced by non-sensitive example files under `docs/examples`.
5. Run a separate focused admin dashboard check for `published` / `matched` transport statistics.
