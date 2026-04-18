# Product Requirements Document (PRD)
## DELF B2 Online Practice Platform

**Version:** 1.0  
**Date:** 2026-04-17  
**Author:** kk-fenglai  
**Status:** Draft

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Overview](#2-product-overview)
3. [Target Users](#3-target-users)
4. [Business Model](#4-business-model)
5. [Feature Requirements](#5-feature-requirements)
6. [User Stories](#6-user-stories)
7. [Technical Architecture](#7-technical-architecture)
8. [Content Strategy](#8-content-strategy)
9. [Subscription & Payments](#9-subscription--payments)
10. [Non-Functional Requirements](#10-non-functional-requirements)
11. [Success Metrics (KPIs)](#11-success-metrics-kpis)
12. [Release Roadmap](#12-release-roadmap)
13. [Risk & Mitigation](#13-risk--mitigation)
14. [Open Questions](#14-open-questions)

---

## 1. Executive Summary

**Product Name:** DelFluent (working title)  
**Tagline:** *Master DELF B2. Pass with confidence.*

DelFluent is a commercial, subscription-based web platform that enables French language learners to prepare for the DELF B2 examination through full-simulation practice across all four official competency areas: Listening (Compréhension de l'oral), Reading (Compréhension des écrits), Writing (Production écrite), and Speaking (Production orale).

The platform targets a global audience of French learners — particularly those in China, Southeast Asia, North Africa, and Europe — offering affordable monthly subscriptions backed by exam-grade content.

---

## 2. Product Overview

### 2.1 Problem Statement

DELF B2 candidates face three major pain points:
1. **Scarcity of quality practice material** — official past papers are hard to obtain and expensive.
2. **No interactive feedback** — paper-based practice offers no instant correction or progress tracking.
3. **Isolated practice** — learners cannot simulate the full 3h15min exam experience online.

### 2.2 Solution

A web-based platform offering:
- Organized practice by skill (Listening, Reading, Writing, Speaking)
- Full timed exam simulations with automated and AI-assisted scoring
- Progress dashboards and performance analytics
- Affordable monthly subscription replacing expensive in-person courses

### 2.3 Unique Value Proposition

> "The most complete DELF B2 digital practice experience — anytime, anywhere, with instant feedback."

### 2.4 Out of Scope (v1.0)

- Mobile native apps (iOS/Android)
- Live tutoring or human correction
- Other DELF/DALF levels (A1, A2, B1, C1, C2)
- Offline mode

---

## 3. Target Users

### 3.1 Primary User Segments

| Segment | Description | Size Estimate |
|---------|-------------|---------------|
| **University Students** | Non-French speakers at European universities requiring B2 for admission or graduation | Large |
| **Immigration Applicants** | Individuals applying for French residency/citizenship needing DELF B2 proof | Medium |
| **Self-learners** | French enthusiasts pursuing B2 certification for career advancement | Large |
| **Chinese Learners** | Students in China preparing for 法语B2 as a second foreign language | Large (priority) |

### 3.2 User Personas

**Persona 1 — Liu Wei, 22, University Student (China)**
- Needs DELF B2 for a French university exchange program
- Studies 1-2 hours per day
- Budget-conscious, prefers monthly payment
- Needs Chinese-language interface support

**Persona 2 — Marie K., 34, Immigration Applicant (Morocco)**
- Needs DELF B2 for French residency application
- Limited time, needs focused exam practice
- Willing to pay for quality content
- Needs mobile-friendly experience

**Persona 3 — Carlos R., 27, Self-Learner (Brazil)**
- Passionate about French, targeting professional certification
- Practices daily, wants detailed performance analytics
- Interested in AI writing feedback

---

## 4. Business Model

### 4.1 Revenue Model — Subscription Tiers

| Plan | Price | Billing | Features |
|------|-------|---------|----------|
| **Free** | €0 | — | 3 questions per section (preview only) |
| **Monthly** | €9.90/month | Monthly | Full access to all content + 5 AI writing corrections/month |
| **Quarterly** | €24.90/quarter | Every 3 months | Full access + 20 AI corrections/month + exam simulations |
| **Annual** | €69.90/year | Yearly | Full access + unlimited AI corrections + priority features |

### 4.2 Revenue Projections

| Month | Paying Users | MRR (est.) |
|-------|-------------|------------|
| Month 3 | 50 | €495 |
| Month 6 | 200 | €1,980 |
| Month 12 | 800 | €7,920 |
| Month 18 | 2,000 | €19,800 |

### 4.3 Payment Methods
- **International:** Stripe (Visa, Mastercard, Apple Pay, Google Pay)
- **China:** Alipay, WeChat Pay (via Stripe or direct integration)

---

## 5. Feature Requirements

### 5.1 Feature Priority Matrix

| Feature | Priority | Phase |
|---------|----------|-------|
| User registration & authentication | P0 | 1 |
| Reading practice module | P0 | 1 |
| Listening practice module | P0 | 1 |
| Stripe subscription integration | P0 | 1 |
| Writing practice module | P1 | 2 |
| Full exam simulation mode | P1 | 2 |
| Progress dashboard | P1 | 2 |
| AI writing correction (Claude API) | P1 | 2 |
| Speaking practice module | P2 | 3 |
| AI speaking evaluation | P2 | 3 |
| Admin CMS for question management | P1 | 2 |
| Error notebook (错题本) | P2 | 3 |
| Multi-language UI (ZH/FR/EN) | P2 | 3 |

---

### 5.2 Module Specifications

#### 5.2.1 Listening Module (Compréhension de l'oral)

**Description:** Simulates DELF B2 listening exercises with authentic audio tracks.

**Functional Requirements:**
- FR-L-01: Display audio player with play/pause/seek controls
- FR-L-02: Support MP3 audio files up to 10 minutes per track
- FR-L-03: Allow maximum 2 listens per audio (matching real exam rules)
- FR-L-04: Present single-choice and multiple-choice questions
- FR-L-05: Auto-grade answers on submission
- FR-L-06: Show correct answers with explanations after submission
- FR-L-07: Track completion and score per exercise set
- FR-L-08: Support transcript view (optional, for review mode)

**DELF B2 Format:**
- Document 1: Interview/report (~5 min) — 8 questions
- Document 2: Radio/TV report (~5 min) — 8 questions
- Total: ~30 minutes, 25 points

---

#### 5.2.2 Reading Module (Compréhension des écrits)

**Description:** Presents reading comprehension texts with exam-format questions.

**Functional Requirements:**
- FR-R-01: Display long-form text (800-1500 words) in readable format
- FR-R-02: Support single-choice, multiple-choice, and true/false/not-mentioned question types
- FR-R-03: Allow user to highlight/annotate text (nice-to-have)
- FR-R-04: Auto-grade on submission
- FR-R-05: Display score breakdown per question
- FR-R-06: Show model answers with explanations

**DELF B2 Format:**
- Text 1: General topic (~800 words) — 13 questions
- Text 2: Argumentative text (~1000 words) — 12 questions
- Total: ~60 minutes, 25 points

---

#### 5.2.3 Writing Module (Production écrite)

**Description:** Presents writing prompts requiring structured essay/letter responses.

**Functional Requirements:**
- FR-W-01: Display writing prompt with word count requirement (typically 250 words minimum)
- FR-W-02: Provide rich text editor with word counter
- FR-W-03: Allow saving draft (auto-save every 30 seconds)
- FR-W-04: Submit for AI correction via Claude API
- FR-W-05: AI feedback covers: task completion, coherence, vocabulary, grammar, register
- FR-W-06: Display estimated score out of 25 points with detailed rubric breakdown
- FR-W-07: Show model answer after submission (optional, user-toggled)
- FR-W-08: Respect AI correction quota per subscription tier

**DELF B2 Format:**
- Task: Argumentative essay, formal letter, or article (~250-300 words)
- Total: ~60 minutes, 25 points

---

#### 5.2.4 Speaking Module (Production orale)

**Description:** Simulates oral exam preparation with prompts and recording capability.

**Functional Requirements:**
- FR-S-01: Display monologue/debate topic card (as in real exam)
- FR-S-02: Show preparation timer (30 minutes preparation)
- FR-S-03: Allow browser-based audio recording (WebRTC)
- FR-S-04: Save recording for self-review
- FR-S-05 (Phase 3): AI scoring via speech-to-text + evaluation API
- FR-S-06: Provide speaking tips and model response structure

**DELF B2 Format:**
- Exercise 1: Monologue from document (~3 min prep, 3 min speak)
- Exercise 2: Point of view + debate with examiner (~5 min)
- Total: ~20 minutes, 25 points

---

#### 5.2.5 Full Exam Simulation Mode

**Functional Requirements:**
- FR-E-01: Present all 4 sections in sequence with official time limits
- FR-E-02: Enforce timers per section (cannot exceed official time)
- FR-E-03: Auto-submit when time expires
- FR-E-04: Generate final score report (total /100, breakdown per section)
- FR-E-05: Allow resuming interrupted exam within 24 hours
- FR-E-06: Lock exam content until all sections are completed
- FR-E-07: Display comparison against average user scores

**Time allocation:**
| Section | Time |
|---------|------|
| Listening | 30 min |
| Reading | 60 min |
| Writing | 60 min |
| Speaking | 20 min (self-recorded) |
| **Total** | **~3h15min** |

---

### 5.3 User Account & Authentication

- FR-A-01: Register via email + password
- FR-A-02: Social login: Google, Apple (Phase 2)
- FR-A-03: Email verification on registration
- FR-A-04: Password reset via email
- FR-A-05: JWT-based session management (access + refresh tokens)
- FR-A-06: Account deletion with data export (GDPR compliance)

---

### 5.4 Progress Dashboard

- FR-D-01: Show overall progress across all 4 sections
- FR-D-02: Display score history per module (line chart)
- FR-D-03: Show estimated readiness score (% toward passing B2)
- FR-D-04: List recently completed exercises
- FR-D-05: Highlight weak areas by skill
- FR-D-06: Show subscription status and renewal date

---

### 5.5 Admin CMS (Back Office)

- FR-ADM-01: Add/edit/delete questions by type
- FR-ADM-02: Upload audio files (MP3) and documents (PDF/text)
- FR-ADM-03: Organize questions into exam sets
- FR-ADM-04: View user analytics (total users, active subscribers, revenue)
- FR-ADM-05: Manage subscription plans and pricing
- FR-ADM-06: Role-based access (admin, content editor)

---

## 6. User Stories

### Authentication
- As a new user, I want to register with my email so I can create an account.
- As a returning user, I want to log in securely so I can access my practice history.
- As a user, I want to reset my password via email if I forget it.

### Practice
- As a subscriber, I want to practice listening exercises so I can improve my oral comprehension.
- As a subscriber, I want to practice reading with timed sessions so I simulate real exam pressure.
- As a subscriber, I want AI feedback on my writing so I understand where to improve.
- As a subscriber, I want to record my oral response so I can review my pronunciation.

### Exam Simulation
- As a subscriber, I want to take a full timed mock exam so I experience the real exam conditions.
- As a subscriber, I want to see my exam score report so I know my current level.

### Subscription
- As a free user, I want to preview 3 questions per section so I evaluate the platform before paying.
- As a user, I want to subscribe monthly via credit card so I can access all content.
- As a subscriber, I want to cancel my subscription at any time so I am not locked in.

### Progress
- As a subscriber, I want to view my score history so I track my improvement over time.
- As a subscriber, I want to see which sections I am weak in so I focus my study.

---

## 7. Technical Architecture

### 7.1 System Overview

```
┌─────────────────────────────────────────────────────────┐
│                     Client (Browser)                     │
│              React + TypeScript + Tailwind               │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS / REST API
┌──────────────────────▼──────────────────────────────────┐
│                  Backend (Node.js / Express)              │
│         Auth │ Questions │ Exams │ Subscriptions          │
└───┬──────────┬──────────┬───────┬────────────────────────┘
    │          │          │       │
┌───▼──┐  ┌───▼──┐  ┌────▼─┐ ┌──▼──────┐
│  DB  │  │  S3  │  │Claude│ │ Stripe  │
│ PG   │  │Audio │  │  API │ │Payments │
└──────┘  └──────┘  └──────┘ └─────────┘
```

### 7.2 Tech Stack

| Layer | Technology | Justification |
|-------|-----------|---------------|
| Frontend | React 18 + TypeScript | Component-based, strong ecosystem |
| Styling | Tailwind CSS | Rapid UI development |
| State | Zustand | Lightweight, simple |
| Backend | Node.js + Express | Fast development, JS full-stack |
| Database | PostgreSQL | Relational, reliable for structured exam data |
| ORM | Prisma | Type-safe DB queries |
| Auth | JWT + bcrypt | Industry standard |
| File Storage | AWS S3 | Scalable audio/PDF storage |
| Payments | Stripe | Global coverage, subscription management |
| AI Correction | Anthropic Claude API | Best-in-class text analysis |
| Email | Resend | Simple transactional email |
| Deployment | Vercel (FE) + Railway (BE) | Low cost, easy scaling |

### 7.3 Database Schema (Key Tables)

```sql
-- Users
users (id, email, password_hash, name, created_at, subscription_status)

-- Subscriptions
subscriptions (id, user_id, plan, status, stripe_subscription_id, current_period_end)

-- Questions
questions (id, type [listening|reading|writing|speaking], title, content, audio_url, difficulty, created_at)
question_options (id, question_id, text, is_correct)

-- Exam Sets
exam_sets (id, title, description, year, is_published)
exam_set_questions (exam_set_id, question_id, order)

-- User Sessions
exam_sessions (id, user_id, exam_set_id, started_at, completed_at, total_score)
user_answers (id, session_id, question_id, answer_text, is_correct, ai_feedback, score)
```

### 7.4 API Design (Key Endpoints)

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh

GET    /api/questions?type=listening&page=1
GET    /api/exam-sets
POST   /api/exam-sessions          (start exam)
PUT    /api/exam-sessions/:id      (submit answers)
GET    /api/exam-sessions/:id/result

POST   /api/writing/correct        (AI correction)

POST   /api/subscriptions/create   (Stripe)
POST   /api/subscriptions/cancel
GET    /api/subscriptions/status

GET    /api/dashboard/progress
```

---

## 8. Content Strategy

### 8.1 Content Types

| Type | Description | Source |
|------|-------------|--------|
| **Past papers (真题)** | Official DELF B2 exams from 2018-2024 | Must obtain license from France Éducation international OR partner with authorized publisher |
| **Original questions (仿真题)** | Questions created to match official format | In-house creation or outsource to certified French teachers |
| **Model answers** | Sample high-scoring responses | Written by certified DELF B2 examiners |
| **Audio tracks** | Listening recordings | Licensed or original recordings |

### 8.2 Content Volume (MVP Launch)

| Section | Minimum for Launch |
|---------|-------------------|
| Listening | 5 complete sets (10 audio documents) |
| Reading | 5 complete sets (10 reading texts) |
| Writing | 15 writing prompts with model answers |
| Speaking | 15 topic cards |
| Full mock exams | 3 complete exam simulations |

### 8.3 Copyright Compliance Plan

1. **Option A (Recommended):** Create original questions that replicate DELF B2 format exactly — no copyright issue.
2. **Option B:** Contact France Éducation international for licensing: [www.france-education-international.fr](https://www.france-education-international.fr)
3. **Option C:** Partner with DELF preparation publishers (Hachette FLE, CLE International) for content licensing.

> ⚠️ Do NOT publish official CIEP exam papers without written authorization.

---

## 9. Subscription & Payments

### 9.1 Stripe Integration Requirements

- SR-01: Create Stripe products and price objects for each plan
- SR-02: Handle `checkout.session.completed` webhook to activate subscription
- SR-03: Handle `invoice.payment_failed` webhook to downgrade to free
- SR-04: Handle `customer.subscription.deleted` webhook for cancellations
- SR-05: Provide billing portal link for users to manage payment methods
- SR-06: Store `stripe_customer_id` and `stripe_subscription_id` in database

### 9.2 Access Control Logic

```
Free user    → can_access = (questions_attempted_today < 3 per section)
Monthly sub  → can_access = true, ai_corrections_remaining = 5
Quarterly    → can_access = true, ai_corrections_remaining = 20
Annual       → can_access = true, ai_corrections_remaining = unlimited
Expired sub  → downgrade to free automatically
```

### 9.3 Refund Policy

- Refund available within 7 days of first subscription if no content was accessed
- No partial refunds for mid-cycle cancellations
- Annual plan: pro-rata refund within 14 days

---

## 10. Non-Functional Requirements

### 10.1 Performance
- NFR-P-01: Page load time < 2 seconds (LCP) on 4G connection
- NFR-P-02: Audio playback starts within 1 second of pressing play
- NFR-P-03: AI writing correction response < 15 seconds
- NFR-P-04: API response time < 500ms for 95th percentile

### 10.2 Availability
- NFR-A-01: 99.5% uptime SLA
- NFR-A-02: Graceful degradation if Claude API is unavailable (queue correction)

### 10.3 Security
- NFR-S-01: All passwords hashed with bcrypt (cost factor 12)
- NFR-S-02: HTTPS enforced on all endpoints
- NFR-S-03: JWT expiry: access token 15min, refresh token 7 days
- NFR-S-04: Rate limiting on auth endpoints (5 attempts / 15 min per IP)
- NFR-S-05: SQL injection prevention via Prisma parameterized queries
- NFR-S-06: Stripe webhook signature verification

### 10.4 Compliance
- NFR-C-01: GDPR compliant (EU users) — privacy policy, data deletion, consent
- NFR-C-02: Cookie consent banner
- NFR-C-03: Terms of Service and Privacy Policy pages required before launch

### 10.5 Accessibility
- NFR-ACC-01: WCAG 2.1 AA compliance
- NFR-ACC-02: Keyboard navigable
- NFR-ACC-03: Audio player has accessible controls

### 10.6 Browser Support
- Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
- Mobile browsers: iOS Safari, Android Chrome

---

## 11. Success Metrics (KPIs)

### 11.1 Business Metrics

| Metric | Target (Month 6) | Target (Month 12) |
|--------|-----------------|------------------|
| Monthly Active Users (MAU) | 500 | 2,000 |
| Paying Subscribers | 200 | 800 |
| Monthly Recurring Revenue (MRR) | €1,980 | €7,920 |
| Conversion Rate (Free → Paid) | 15% | 20% |
| Monthly Churn Rate | < 8% | < 5% |
| Average Revenue Per User (ARPU) | €9.90 | €9.90 |

### 11.2 Product Metrics

| Metric | Target |
|--------|--------|
| Average session duration | > 25 minutes |
| Questions completed per session | > 15 |
| AI correction usage rate | > 60% of eligible subscribers |
| Full exam completion rate | > 40% of subscribers |
| NPS Score | > 40 |

---

## 12. Release Roadmap

### Phase 1 — MVP (Weeks 1-6)

**Goal:** Launch with core practice features and payment.

- [ ] User authentication (register, login, password reset)
- [ ] Reading practice module (auto-graded)
- [ ] Listening practice module (auto-graded)
- [ ] Question database (5 sets per section)
- [ ] Stripe subscription integration (Monthly plan only)
- [ ] Free tier with preview limits
- [ ] Basic user dashboard
- [ ] Landing page with pricing
- [ ] Terms of Service + Privacy Policy

**Launch Criteria:**
- All P0 features complete
- 3 complete exam sets available
- Payment flow tested end-to-end
- No critical security vulnerabilities

---

### Phase 2 — Core Product (Weeks 7-12)

**Goal:** Complete all 4 sections + exam simulation.

- [ ] Writing module with AI correction (Claude API)
- [ ] Speaking module (recording + self-review)
- [ ] Full timed exam simulation mode
- [ ] Score report with breakdown
- [ ] Progress dashboard with analytics
- [ ] Admin CMS for content management
- [ ] Quarterly and Annual subscription plans
- [ ] Email notifications (welcome, subscription renewal)

---

### Phase 3 — Growth (Weeks 13-24)

**Goal:** Optimize retention and expand features.

- [ ] AI speaking evaluation
- [ ] Error notebook (错题本)
- [ ] Multi-language UI (Chinese, French, English)
- [ ] Social login (Google, Apple)
- [ ] Referral program
- [ ] Mobile-responsive optimization
- [ ] Performance optimization and CDN setup

---

## 13. Risk & Mitigation

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Copyright infringement on exam content | High | Critical | Use original questions only; obtain legal review before launch |
| Low conversion from free to paid | Medium | High | Improve onboarding flow; A/B test pricing |
| Claude API costs exceed projections | Medium | Medium | Implement correction quotas per tier; cache common feedback |
| Audio streaming costs spike | Low | Medium | Use S3 presigned URLs; implement CDN caching |
| Payment fraud via Stripe | Low | High | Enable Stripe Radar fraud rules |
| GDPR non-compliance | Medium | High | Engage legal counsel; implement consent management |
| Poor user retention (churn > 10%) | Medium | High | Improve content quality; add streak/gamification |

---

## 14. Open Questions

| # | Question | Owner | Due |
|---|---------|-------|-----|
| 1 | Will content be original questions or licensed past papers? | Product | Before Phase 1 start |
| 2 | Primary target market: China-first or global-first? | Business | Before Phase 1 start |
| 3 | Website interface language: Chinese, French, or bilingual? | Product | Before Phase 1 start |
| 4 | Will speaking module include AI scoring at launch? | Tech | Phase 1 planning |
| 5 | Which payment methods for China (Alipay/WeChat)? | Business | Phase 1 planning |
| 6 | Is there a need for a mobile app in Year 1? | Business | Month 6 review |
| 7 | Who creates and maintains question content? | Content | Before Phase 1 start |

---

## Appendix A — DELF B2 Official Exam Format Reference

| Skill | Section | Duration | Points | Pass Mark |
|-------|---------|----------|--------|-----------|
| Compréhension de l'oral | 2 audio docs + questions | ~30 min | 25 | — |
| Compréhension des écrits | 2 reading texts + questions | 60 min | 25 | — |
| Production écrite | 1 writing task | 60 min | 25 | — |
| Production orale | Monologue + debate | ~20 min | 25 | — |
| **TOTAL** | | **~3h15min** | **100** | **50/100 (min 5/25 per section)** |

*Source: France Éducation international official DELF guidelines*

---

## Appendix B — Competitive Analysis

| Competitor | Strengths | Weaknesses | Our Advantage |
|-----------|-----------|------------|---------------|
| TV5Monde Exercises | Free, official content | No exam simulation, no scoring | Full simulation + AI feedback |
| Hachette FLE books | Quality content | Static, no interactivity | Interactive + progress tracking |
| Preply / iTalki | Human tutors | Expensive (€30-80/hr) | Affordable subscription |
| Frantastique | Gamified French | Not DELF-focused | DELF-specific, exam format |
| Le Point du FLE | Free resources | No structured exam prep | Structured B2 path + analytics |

---

*Document end. Version 1.0 — For internal use only.*
