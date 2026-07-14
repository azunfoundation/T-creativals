'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Info, X } from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface HelpContent {
  what?: string;
  why?: string;
  when?: string;
  steps?: string[];
  bestPractices?: string[];
  mistakes?: string[];
  example?: string;
  warning?: string;
}

interface HelpIconProps {
  /** Short one-line tip shown as a native hover tooltip. Use for a quick field hint. */
  text?: string;
  /** Structured explanation shown in a click-to-open popover. Use for a feature/section. */
  content?: HelpContent;
  /** Optional label prefixing the popover, e.g. the field/feature name. */
  title?: string;
  size?: number;
}

// Panel dimensions (used for positioning math)
const PANEL_WIDTH = 320;
const PANEL_MAX_HEIGHT = 480;
const PANEL_MARGIN = 10; // gap from trigger icon, px
const VIEWPORT_PADDING = 8; // min distance from viewport edges, px

// ─────────────────────────────────────────────────────────────────────────────
// Rich content enrichment logic  (unchanged from original)
// ─────────────────────────────────────────────────────────────────────────────

function getEnrichedContent(text?: string, title?: string): HelpContent {
  const normText = (text || '').toLowerCase();
  const normTitle = (title || '').toLowerCase();

  if (normText.includes('temperature') || normTitle.includes('temperature') || normText.includes('cold: just exploring')) {
    return {
      what: 'A purchasing readiness rating indicating how close a lead is to buying (Cold, Warm, or Hot).',
      why: 'Enables sales representatives to prioritize high-intent leads and helps management build accurate pipeline conversion forecasts.',
      when: 'Evaluate and update immediately after customer interactions or when new buying signals are observed.',
      example: 'Mark a lead "Hot" when they request contract drafts, or "Cold" if they stop replying to emails.',
      mistakes: ['Leaving inactive leads marked as "Hot", which distorts dashboard revenue forecasting metrics.']
    };
  }

  if (normText.includes('monthly budget') || normTitle.includes('monthly budget') || normText.includes('estimated monthly') || normText.includes('budget filter') || normTitle.includes('budget')) {
    return {
      what: 'The estimated monthly spend a prospect or client is willing to allocate for services.',
      why: 'Qualifies deals during client intake, guides project scoping, and scales pipeline contract projections.',
      when: 'Enter during initial lead qualification and refine as the service scope becomes clearer.',
      example: 'A CRM lead with an estimated monthly budget of ₹1,50,000 for development services.',
      mistakes: ['Treating the budget as a firm price contract. Treat it as a flexible reference until the quote is signed.']
    };
  }

  if (normText.includes('tds') || normText.includes('tax deducted') || normText.includes('gst percentage') || normTitle.includes('tax') || normText.includes('tax rate') || normText.includes('tax percentage')) {
    return {
      what: 'Statutory tax rates (e.g. GST) or withholding tax percentages (TDS) applied to transactions or payroll.',
      why: 'Ensures compliance with national taxation laws and calculates accurate take-home pay or invoice totals.',
      when: 'Apply standard GST on client invoices, and configure employee TDS percentages during onboarding.',
      example: 'Adding 18% GST to a base service charge of ₹10,000, or withholding 10% TDS from a consultant\'s payout.',
      mistakes: ['Entering inaccurate tax percentages, which leads to statutory non-compliance, payroll corrections, or audit penalties.']
    };
  }

  if (normText.includes('status guide') || normText.includes('status') || normTitle.includes('status')) {
    return {
      what: 'The active lifecycle state of a record (e.g., active/inactive user, paid/unpaid invoice, in-progress task).',
      why: 'Tracks real-time progress, organizes queues, and controls system behavior like blocking login for inactive users.',
      when: 'Update immediately when an invoice is paid, task completed, or staff leaves the company.',
      example: 'Moving an invoice from "Sent" to "Paid" upon bank confirmation, or setting a user to "Inactive" to disable portal access.',
      mistakes: ['Leaving completed tasks or inactive leads as "In Progress", which distorts dashboard reports and key performance indicators.']
    };
  }

  if (normText.includes('priority') || normTitle.includes('priority')) {
    return {
      what: 'The urgency level of a task or project, ranging from Low to Critical.',
      why: 'Guides team focus and scheduling to resolve blockers and hit milestones efficiently.',
      when: 'Set at task creation and adjust if deadlines change or blockers arise.',
      example: 'Mark server outages or launch blockages as "Critical", while using "Low" priority for minor cosmetic tweaks.',
      mistakes: ['Marking every task as "High" or "Critical", which creates alert fatigue and ruins team focus.']
    };
  }

  if (normText.includes('assignee') || normText.includes('accountable') || normText.includes('assigned') || normTitle.includes('assignee')) {
    return {
      what: 'The designated employee responsible for completing a task or overseeing a lead.',
      why: 'Establishes clear ownership so work is tracked and executed on schedule.',
      when: 'Assign immediately upon task creation or when transferring ownership of a client lead.',
      example: 'Assigning the "Database Migration" task to a Senior Developer.',
      mistakes: ['Leaving tasks without an assignee, causing them to sit ignored in the backlog.']
    };
  }

  if (normText.includes('approval') || normText.includes('approve') || normTitle.includes('approval') || normText.includes('review')) {
    return {
      what: 'Managerial sign-off on billable timesheets, quotes, or business expenses.',
      why: 'Enforces internal financial controls, verifies billing accuracy, and prevents unsanctioned discount offers.',
      when: 'Run approval reviews after submission and before client dispatch or payroll processing.',
      example: 'A Founder approving a custom 15% discount on a project quote before it is emailed.',
      mistakes: ['Approving submissions without verification, bypassing critical company control checks.']
    };
  }

  if (normText.includes('interested services') || normText.includes('services this lead wants') || normText.includes('services lead wants') || normTitle.includes('services')) {
    return {
      what: 'A checklist of services a lead is interested in purchasing (e.g. UI/UX Design, Development).',
      why: 'Tailors follow-up messaging and automatically pre-fills proposals or quotes.',
      when: 'Tick these boxes during the initial client discovery call.',
      example: 'Selecting "UI/UX Design" and "Custom Next.js Site" for a client wanting a website overhaul.',
      mistakes: ['Leaving this empty, forcing sales reps to repeatedly ask the client for their requirements.']
    };
  }

  if (normText.includes('health score') || normTitle.includes('health')) {
    return {
      what: 'A numerical rating (0-100) reflecting the stability and collection risk of a client account.',
      why: 'Flags accounts needing attention due to unpaid bills or project delays.',
      when: 'Calculated dynamically based on payment history and active project blocks.',
      example: 'A client with two overdue invoices dropping from 100 to 80 health score.',
      mistakes: ['Ignoring score drops until contract renewal time, when the client is already unhappy.']
    };
  }

  if (normText.includes('portal access') || normText.includes('client portal') || normTitle.includes('portal')) {
    return {
      what: 'A toggle that enables or disables client sign-in to the customer portal.',
      why: 'Secures proprietary project updates and financial bills from unauthorized viewers.',
      when: 'Turn on during client onboarding and off if a contract is terminated.',
      example: 'Setting access "Active" so a client contact can log in and download their invoice.',
      mistakes: ['Leaving portal access active for client employees who have left their organization.']
    };
  }

  if (normText.includes('billed') || normTitle.includes('billed')) {
    return {
      what: 'The total value of all approved invoices generated for a client since onboarding.',
      why: 'Measures total account value and tracks long-term customer lifetime value (LTV).',
      when: 'Updates automatically as invoices are created, approved, and sent.',
      example: 'A long-term partner reaching ₹15,00,000 in lifetime billing.',
      mistakes: ['Confusing billed revenue with cash collected, as this includes unpaid outstanding invoices.']
    };
  }

  if (normText.includes('outstanding') || normTitle.includes('outstanding')) {
    return {
      what: 'The cumulative total of unpaid invoices currently sent to a client.',
      why: 'Determines overall collections exposure and sets prioritization for finance callbacks.',
      when: 'Recalculates dynamically as invoices are sent and payments are verified.',
      example: 'A client having ₹50,000 outstanding across two invoices that are 15 days past due.',
      mistakes: ['Allowing outstanding balances to accumulate without collection contact, leading to cash flow issues.']
    };
  }

  if (normText.includes('provident fund') || normText.includes('pf') || normTitle.includes('pf')) {
    return {
      what: 'Retirement-savings percentage deducted from basic salary (usually 12%).',
      why: 'Statutory compliance ensuring post-retirement financial security for personnel.',
      when: 'Configured during payroll setups and processed monthly.',
      example: 'A 12% deduction from the basic pay segment towards the employee provident fund.',
      mistakes: ['Using incorrect salary baselines, resulting in statutory audits and tax correction liabilities.']
    };
  }

  if (normText.includes('employee state insurance') || normText.includes('esi') || normTitle.includes('esi')) {
    return {
      what: 'State-managed healthcare insurance contribution deducted from eligible employee salaries.',
      why: 'Mandatory social security program providing medical benefits to qualified personnel.',
      when: 'Set on onboarding for employees below the statutory wage threshold.',
      example: 'Deducting 0.75% of gross earnings for eligible employees for state medical insurance coverage.',
      mistakes: ['Failing to deactivate deductions if an employee\'s gross salary rises past the statutory limit.']
    };
  }

  if (normText.includes('internal staff code') || normText.includes('employee id') || normTitle.includes('employee id') || normText.includes('staff code')) {
    return {
      what: 'A unique code identifying an employee internally (e.g. CRE007).',
      why: 'Links employee attendance, payroll, and tasks reliably across databases.',
      when: 'Assigned during staff onboarding and kept permanently.',
      example: 'Employee ID "CRE034" assigned to a project lead.',
      mistakes: ['Reusing IDs of former staff, which pollutes historical reporting and breaks relational databases.']
    };
  }

  if (normText.includes('roles') || normTitle.includes('roles') || normText.includes('role controls')) {
    return {
      what: 'System permissions (e.g. Admin, Designer) defining access to platform features.',
      why: 'Secures company and client data by limiting users to features required for their job.',
      when: 'Set during user creation and adjust as duties or teams change.',
      example: 'Giving the "Finance" role to a billing manager so they can approve invoices.',
      mistakes: ['Granting "Admin" privileges broadly, exposing critical billing or database configurations to security risk.']
    };
  }

  if (normText.includes('departments') || normTitle.includes('departments') || normText.includes('which team')) {
    return {
      what: 'Organizational groupings representing functional divisions (e.g., Design, Tech).',
      why: 'Supports internal reporting, workload management, and manager approval mapping.',
      when: 'Select during user onboarding.',
      example: 'Placing a new hire in the "Development" department.',
      mistakes: ['Confounding roles with departments. A designer and a project manager can both belong to the Design department but have different system roles.']
    };
  }

  if (normText.includes('manager') || normText.includes('reports to') || normTitle.includes('manager')) {
    return {
      what: 'Direct reporting structure outlining which supervisor reviews an employee\'s output.',
      why: 'Directs workflow requests like timesheet reviews and leaves to the correct desk automatically.',
      when: 'Configured on hire and updated upon promotions or team re-organizations.',
      example: 'Assigning the Tech Director as manager for a junior engineer.',
      mistakes: ['Leaving reporting managers unassigned, causing timesheet or leave approvals to stall.']
    };
  }

  if (normText.includes('expected start date')) {
    return {
      what: 'The anticipated calendar date when project executions are set to kick off.',
      why: 'Essential for resource scheduling, pipeline staging, and engineering capacity coordination.',
      when: 'Set during lead qualification or when contract signatures are expected.',
      example: 'Scheduling a website build to start on 1 August 2026.',
      mistakes: ['Setting unrealistic dates without consulting the engineering queue capacity.']
    };
  }

  if (normText.includes('quote the client receives') || normText.includes('validity, payment split')) {
    return {
      what: 'Printable quote details detailing validity dates, payment splits, and specific tax terms.',
      why: 'Provides legal and commercial clarity for the client to review before signing.',
      when: 'Edit and finalize during the quotation drafting stage.',
      example: 'Setting quote validity to 30 days and payment split as 50% advance, 50% on completion.',
      mistakes: ['Leaving placeholder text in client terms, making the offer look unprofessional.']
    };
  }

  if (normText.includes('price for one unit') || normText.includes('pre-tax price')) {
    return {
      what: 'The pre-tax price billed for one unit of service (e.g. per hour, per month, or package flat rate).',
      why: 'Calculates basic quote lines before taxes (such as 18% GST) are computed.',
      when: 'Configure standard catalog rates or override during direct quote line creation.',
      example: 'Setting custom website package design to ₹45,000.',
      mistakes: ['Entering tax-inclusive pricing in the pre-tax price box, resulting in double-tax calculations.']
    };
  }

  if (normText.includes('how this service is billed')) {
    return {
      what: 'The billing type setting (per hour, per month, flat rate, per unit) for catalog items.',
      why: 'Communicates exactly how work is tracked and billed to the client.',
      when: 'Define when creating new services in the catalog list.',
      example: 'Selecting "Per Hour" billing for custom software consultation.',
      mistakes: ['Changing units on active contracts without notifying clients, causing billing confusion.']
    };
  }

  if (normText.includes('combined base price') || normText.includes('take a % off')) {
    return {
      what: 'Group rate discount percentages or flat rates applied to service bundles.',
      why: 'Incentivizes larger contracts by offering package discount percentages.',
      when: 'Applied during custom service package creation.',
      example: 'Setting a package discount of 15% off the sum of three services.',
      mistakes: ['Offering steep package discounts that erode project execution profitability.']
    };
  }

  if (normText.includes('tick every service included')) {
    return {
      what: 'A catalog selection list grouping multiple services into a single package.',
      why: 'Saves time during quotation generation by bundling common service groupings.',
      when: 'Configured during package template creation in services admin.',
      example: 'Checking "SEO Audit" and "Keyword Setup" to create an onboarding bundle.',
      mistakes: ['Bundling monthly recurring services with one-time setup tasks, making billing summaries confusing.']
    };
  }

  if (normText.includes('uncheck for internal work')) {
    return {
      what: 'A toggle separating billable client execution hours from internal administrative work.',
      why: 'Ensures clients are only billed for actual project execution and tracks developer utilization.',
      when: 'Checked by team members when logging timesheet hours.',
      example: 'Logging 4 hours as "Billable" for database coding and 1 hour as "Non-Billable" for team standup.',
      mistakes: ['Logging internal training hours as billable client hours, causing invoice audit disputes.']
    };
  }

  if (normText.includes('temporary password for the new user')) {
    return {
      what: 'Initial secure login credentials set temporarily for new platform users.',
      why: 'Allows secure onboarding without administrators knowing the user\'s private password.',
      when: 'Entered when registering a new system user profile.',
      example: 'Entering "TempPass2026!" and asking the user to change it immediately upon login.',
      mistakes: ['Using simple guessable passwords (like "123456"), exposing the account to initial brute-force risks.']
    };
  }

  if (normText.includes('platform event that starts this rule')) {
    return {
      what: 'The base system event (e.g. invoice creation, lead status change) initiating an automation sequence.',
      why: 'Automates manual operational reactions, eliminating delays or forgotten tasks.',
      when: 'Defined during the first step of automation rule creations.',
      example: 'Selecting "Lead Created" as the trigger to kick off welcome notifications.',
      mistakes: ['Configuring broad triggers without narrow matching criteria, triggering runs on irrelevant records.']
    };
  }

  if (normText.includes('switch this rule on or off')) {
    return {
      what: 'A toggle enabling or disabling active execution status for an automation rule.',
      why: 'Allows pausing automation flows for system maintenance without deleting configured logic.',
      when: 'Toggled during testing or rule configuration updates.',
      example: 'Turning off an "Email Client on Payment" rule during invoice migration cleanup.',
      mistakes: ['Leaving inactive draft rules turned on, sending accidental alerts during updates.']
    };
  }

  if (normText.includes('filter checked before the action')) {
    return {
      what: 'Filtering conditions verifying record values before executing automation actions.',
      why: 'Restricts automation executions to specific scenarios, preventing unnecessary task bloat.',
      when: 'Configured during step 2 of rule definitions.',
      example: 'Filtering condition "status equals hot" to prevent sending emails to cold prospects.',
      mistakes: ['Using capitalized field values (like "HOT") if system records store values in lowercase (like "hot").']
    };
  }

  if (normText.includes('what happens when the rule fires')) {
    return {
      what: 'The target system output (task creation, notifications) executed upon rule triggers.',
      why: 'Executes administrative tasks instantly, keeping teams updated automatically.',
      when: 'Set as the final step of automation rule builders.',
      example: 'Setting the rule to create a task titled "Schedule Discovery Call" when a lead is created.',
      mistakes: ['Leaving notification variables placeholder texts un-mapped, rendering blank text fields.']
    };
  }

  if (normText.includes('numeric id of the project')) {
    return {
      what: 'The target database ID of the project where automated tasks are created.',
      why: 'Ensures automated rule tasks land in the appropriate project board rather than general backlogs.',
      when: 'Specified within "Create Task" action steps.',
      example: 'Entering project ID "4" by reading it from the project URL path.',
      mistakes: ['Entering invalid project IDs, causing the automation execution to fail.']
    };
  }

  if (normText.includes('project is a retainer')) {
    return {
      what: 'A configuration setting indicating a recurring monthly service project model.',
      why: 'Automates scheduling by recreating template tasks on the 1st of every month.',
      when: 'Checked when applying templates to retainer project scopes.',
      example: 'Configuring monthly retainer boards for client hosting maintenance.',
      mistakes: ['Ticking this box on one-time delivery projects, causing duplicate monthly task creation.']
    };
  }

  if (normText.includes('each line becomes one task')) {
    return {
      what: 'A line-separated text import field mapping rows to individual tasks.',
      why: 'Speeds up project initialization by copying pre-drafted checklists directly.',
      when: 'Used during initial task layout planning in the Apply Template modal.',
      example: 'Entering "Design Setup", "Coding Stage", and "Client QA Review" on separate lines.',
      mistakes: ['Including blank lines or numbering prefixes, creating malformed checklist items.']
    };
  }

  if (normText.includes('client account this project is billed under')) {
    return {
      what: 'The primary client association link governing project billing and reports.',
      why: 'Organizes billing details, profitability metrics, and files under a single client account.',
      when: 'Selected when initializing project setups.',
      example: 'Linking the "Vite Redesign" project to client "Acme Corp".',
      mistakes: ['Linking to the wrong client account, which corrupts billing records and client portals.']
    };
  }

  if (normText.includes('link the invoice that is funding')) {
    return {
      what: 'A relational invoice mapping link associating a project with its source funding billing invoice.',
      why: 'Calculates profitability charts by comparing received invoice payments against hourly employee labor costs.',
      when: 'Configured inside the project edit dashboard.',
      example: 'Mapping invoice "INV-0012" to the corresponding UI build project.',
      mistakes: ['Leaving this unlinked on billable projects, rendering profitability margins at zero.']
    };
  }

  if (normText.includes('employee accountable for this project')) {
    return {
      what: 'The designated employee responsible for directing the project team and confirming milestones.',
      why: 'Ensures clear project ownership and handles approvals for task completions.',
      when: 'Configured during project onboarding.',
      example: 'Setting a Senior Project Lead as the accountable director.',
      mistakes: ['Assigning projects to team members who are already over capacity, causing delivery delays.']
    };
  }

  if (normText.includes('hours you expect this project to take')) {
    return {
      what: 'The budgeted hour threshold allocated for total project completions.',
      why: 'Provides a reference line for measuring burned developer hours against budget caps.',
      when: 'Entered during the initial project planning stage.',
      example: 'Allocating 80 hours for wireframe and design work.',
      mistakes: ['Entering optimistic low estimates, leading to early budget exhaustion warnings.']
    };
  }

  if (normText.includes('contract value for this project')) {
    return {
      what: 'The total revenue value agreed for the project contract scope.',
      why: 'Forms the baseline metric for calculating gross profitability margin against cost metrics.',
      when: 'Entered during project onboarding.',
      example: 'Setting project contract value to ₹5,00,000.',
      mistakes: ['Entering tax-inclusive totals, which skews net margin reports.']
    };
  }

  if (normText.includes('milestones are the big checkpoints')) {
    return {
      what: 'Timeline checkpoint stages categorizing project workflows (e.g. Phase 1: Planning).',
      why: 'Divides large project timelines into manageable, trackable billing segments.',
      when: 'Defined during project setup or template imports.',
      example: 'Creating milestone "Beta Testing" to manage final bugs before release.',
      mistakes: ['Lumping all tasks into one massive milestone, making progress tracking difficult.']
    };
  }

  if (normText.includes('revenue comes from this project')) {
    return {
      what: 'Profitability metric showing total received billing amounts originating from a project.',
      why: 'Determines which project types yield high margins for the agency.',
      when: 'Updates dynamically as invoicing and client payments are finalized.',
      example: 'Viewing ₹2,00,000 in collected revenue against ₹1,20,000 in developer salary costs.',
      mistakes: ['Ignoring margins on active projects, resulting in cash-losing deliverables.']
    };
  }

  if (normText.includes('crm lead this proposal is for')) {
    return {
      what: 'CRM mapping linking a proposal quote to a sales prospect record.',
      why: 'Ensures proposal approvals move lead pipeline stages to "Won" automatically.',
      when: 'Selected when initiating quote drafts.',
      example: 'Linking a web build quote to lead "Rajesh Kumar".',
      mistakes: ['Creating quotes without linking the lead, leaving sales cards stranded in "Quoted" status.']
    };
  }

  if (normText.includes('use this instead of a lead')) {
    return {
      what: 'Option to quote active clients directly for new work contracts (repeat business).',
      why: 'Skips CRM pipeline staging steps since client profiles already exist in the system.',
      when: 'Selected during quote builder setups.',
      example: 'Linking a new illustration quote directly to client "Acme Corp".',
      mistakes: ['Creating a new lead profile for an existing client, producing duplicate client records.']
    };
  }

  if (normText.includes('each subtask is its own small task')) {
    return {
      what: 'Micro checklist items embedded within a larger task description.',
      why: 'Allows tracking complex deliverables step-by-step without polluting main boards.',
      when: 'Added inside task detailed slideover cards.',
      example: 'Adding subtasks "Draft outline", "Get approval", and "Publish post" under "Blog Post" task.',
      mistakes: ['Writing massive deliverables as subtasks instead of standalone task items.']
    };
  }

  if (normText.includes('click any project card to see')) {
    return {
      what: 'Dashboard navigation cards linking to full project workspace views.',
      why: 'Provides fast shortcuts to view task progression and milestones.',
      when: 'Used on portal and admin dashboard summaries.',
      example: 'Clicking the "Logo Design" card to view milestones.',
      mistakes: ['Double-clicking project cards, causing double page reload actions.']
    };
  }

  return generateFallbackHelp(text || '', title);
}

function generateFallbackHelp(text: string, title?: string): HelpContent {
  let inferredTitle = title || 'Field Information';
  if (!title && text) {
    const words = text.split(' ');
    if (words.length <= 4) {
      inferredTitle = text.replace(/[—.-]/g, '').trim();
    } else {
      inferredTitle = words.slice(0, 3).join(' ').replace(/[—.-]/g, '').trim() + ' Info';
    }
  }
  inferredTitle = inferredTitle
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  return {
    what: text || `Specifies the details for the ${inferredTitle} field.`,
    why: `Helps maintain accurate data integrity and classification across the system.`,
    when: `Provide or review this value whenever you are configuring or editing this record.`,
    example: `Ensure a valid value is entered (e.g. standard format or selection).`,
    mistakes: [`Leaving this field with outdated or incorrect values, which can impact dashboard metrics.`]
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Portal-based floating panel — renders directly into document.body so it is
// NEVER clipped by a parent container's overflow:hidden.
// ─────────────────────────────────────────────────────────────────────────────

interface PanelPosition {
  top: number;
  left: number;
  transformOrigin: string;
}

function computePosition(triggerRect: DOMRect): PanelPosition {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const p = VIEWPORT_PADDING;

  // Try RIGHT of the icon first
  const spaceRight = vw - triggerRect.right - PANEL_MARGIN;
  const spaceLeft  = triggerRect.left - PANEL_MARGIN;
  const spaceBelow = vh - triggerRect.bottom - PANEL_MARGIN;
  const spaceAbove = triggerRect.top - PANEL_MARGIN;

  let left: number;
  let top: number;
  let transformOrigin: string;

  // ── Horizontal axis ──
  if (spaceRight >= PANEL_WIDTH) {
    // Enough space to the right
    left = triggerRect.right + PANEL_MARGIN;
    transformOrigin = 'left center';
  } else if (spaceLeft >= PANEL_WIDTH) {
    // Enough space to the left
    left = triggerRect.left - PANEL_MARGIN - PANEL_WIDTH;
    transformOrigin = 'right center';
  } else {
    // Neither side has full width — center horizontally and clamp
    left = triggerRect.left + triggerRect.width / 2 - PANEL_WIDTH / 2;
    transformOrigin = 'top center';
  }

  // ── Vertical axis (start aligned to trigger center) ──
  const idealTop = triggerRect.top + triggerRect.height / 2 - 40;

  if (transformOrigin === 'top center') {
    // Panel goes below or above
    if (spaceBelow >= PANEL_MAX_HEIGHT * 0.5) {
      top = triggerRect.bottom + PANEL_MARGIN;
      transformOrigin = 'top center';
    } else {
      top = triggerRect.top - PANEL_MARGIN - Math.min(PANEL_MAX_HEIGHT, spaceAbove);
      transformOrigin = 'bottom center';
    }
  } else {
    top = idealTop;
  }

  // ── Clamp so the panel is always fully inside the viewport ──
  const maxLeft = Math.max(p, vw - PANEL_WIDTH - p);
  left = Math.max(p, Math.min(left, maxLeft));
  top  = Math.max(p, Math.min(top, vh - p));

  return { top, left, transformOrigin };
}

// ─────────────────────────────────────────────────────────────────────────────
// Floating panel (portal child)
// ─────────────────────────────────────────────────────────────────────────────

interface FloatingPanelProps {
  triggerRect: DOMRect;
  resolvedContent: HelpContent;
  title?: string;
  onClose: () => void;
}

function FloatingHelpPanel({ triggerRect, resolvedContent, title, onClose }: FloatingPanelProps) {
  const [pos, setPos] = useState<PanelPosition>(() => computePosition(triggerRect));
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Animate in
  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  // Recompute on scroll/resize
  useEffect(() => {
    const recompute = () => setPos(computePosition(triggerRect));
    window.addEventListener('scroll', recompute, true);
    window.addEventListener('resize', recompute);
    return () => {
      window.removeEventListener('scroll', recompute, true);
      window.removeEventListener('resize', recompute);
    };
  }, [triggerRect]);

  // Click-outside & Escape to close
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const panelStyle: React.CSSProperties = {
    position: 'fixed',
    top: pos.top,
    left: pos.left,
    zIndex: 2147483647, // max z-index — always above everything
    width: PANEL_WIDTH,
    maxWidth: `calc(100vw - ${VIEWPORT_PADDING * 2}px)`,
    maxHeight: PANEL_MAX_HEIGHT,
    overflowY: 'auto',
    background: 'var(--surface-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.28), 0 2px 8px rgba(0,0,0,0.18)',
    padding: '1rem 1.125rem 1.125rem',
    fontSize: '0.8125rem',
    lineHeight: 1.6,
    color: 'var(--text-secondary)',
    textAlign: 'left',
    transformOrigin: pos.transformOrigin,
    // Animate in
    opacity: visible ? 1 : 0,
    transform: visible ? 'scale(1) translateY(0)' : 'scale(0.94) translateY(-4px)',
    transition: 'opacity 0.18s ease, transform 0.18s ease',
    pointerEvents: 'auto',
    // Custom scrollbar styling (CSS vars might not apply here so we inline webkit)
    scrollbarWidth: 'thin',
  };

  const sectionStyle: React.CSSProperties = { margin: '0 0 0.5rem' };
  const strongPrimary: React.CSSProperties = { color: 'var(--text-primary)' };
  const strongDanger: React.CSSProperties = { color: 'var(--danger)' };
  const strongSuccess: React.CSSProperties = { color: 'var(--success)' };
  const listStyle: React.CSSProperties = { margin: '0.25rem 0 0', paddingLeft: '1.1rem' };

  return (
    <div
      ref={panelRef}
      role="tooltip"
      aria-label={title || 'Help information'}
      style={panelStyle}
      onClick={e => e.stopPropagation()}
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <Info size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          {title && (
            <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.8125rem', letterSpacing: '0.01em' }}>
              {title}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close help panel"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: '50%',
            background: 'transparent',
            border: 'none', cursor: 'pointer', padding: 0,
            color: 'var(--text-muted)',
            flexShrink: 0,
            transition: 'background 0.15s, color 0.15s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'var(--surface-hover)';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-primary)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)';
          }}
        >
          <X size={12} />
        </button>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border)', marginBottom: '0.625rem', opacity: 0.6 }} />

      {/* Content sections */}
      {resolvedContent.what && (
        <p style={sectionStyle}>
          <strong style={strongPrimary}>What is it? </strong>
          {resolvedContent.what}
        </p>
      )}
      {resolvedContent.why && (
        <p style={sectionStyle}>
          <strong style={strongPrimary}>Why is it used? </strong>
          {resolvedContent.why}
        </p>
      )}
      {resolvedContent.when && (
        <p style={sectionStyle}>
          <strong style={strongPrimary}>When should it be used? </strong>
          {resolvedContent.when}
        </p>
      )}
      {resolvedContent.example && (
        <p style={sectionStyle}>
          <strong style={strongPrimary}>Example: </strong>
          {resolvedContent.example}
        </p>
      )}
      {resolvedContent.warning && (
        <p style={sectionStyle}>
          <strong style={strongDanger}>Warning: </strong>
          {resolvedContent.warning}
        </p>
      )}
      {resolvedContent.steps && resolvedContent.steps.length > 0 && (
        <div style={sectionStyle}>
          <strong style={strongPrimary}>Steps:</strong>
          <ol style={listStyle}>
            {resolvedContent.steps.map((s, i) => <li key={i}>{s}</li>)}
          </ol>
        </div>
      )}
      {resolvedContent.bestPractices && resolvedContent.bestPractices.length > 0 && (
        <div style={sectionStyle}>
          <strong style={strongSuccess}>Best practice:</strong>
          <ul style={listStyle}>
            {resolvedContent.bestPractices.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}
      {resolvedContent.mistakes && resolvedContent.mistakes.length > 0 && (
        <div>
          <strong style={strongDanger}>Avoid:</strong>
          <ul style={listStyle}>
            {resolvedContent.mistakes.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main HelpIcon export
// ─────────────────────────────────────────────────────────────────────────────

export function HelpIcon({ text, content, title, size = 14 }: HelpIconProps) {
  const [open, setOpen] = useState(false);
  const [triggerRect, setTriggerRect] = useState<DOMRect | null>(null);
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const resolvedContent = content || getEnrichedContent(text, title);

  // Only portal-render client-side
  useEffect(() => { setMounted(true); }, []);

  const openPanel = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (btnRef.current) {
      setTriggerRect(btnRef.current.getBoundingClientRect());
    }
    setOpen(true);
  }, []);

  const closePanel = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setOpen(false), 80);
  }, []);

  const togglePanel = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (open) {
      setOpen(false);
    } else {
      openPanel();
    }
  }, [open, openPanel]);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={togglePanel}
        onMouseEnter={openPanel}
        onMouseLeave={closePanel}
        onFocus={openPanel}
        onBlur={closePanel}
        title={text || 'Help'}
        aria-expanded={open}
        aria-haspopup="dialog"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: size + 6, height: size + 6, borderRadius: '50%',
          background: open ? 'var(--accent-subtle)' : 'transparent',
          color: open ? 'var(--accent)' : 'var(--text-muted)',
          border: 'none', cursor: 'pointer', padding: 0,
          outline: 'none',
          verticalAlign: 'middle',
          flexShrink: 0,
          transition: 'background 0.15s, color 0.15s',
        }}
      >
        <Info size={size} />
      </button>

      {/* Portal: renders directly into document.body — never clipped */}
      {mounted && open && triggerRect &&
        createPortal(
          <FloatingHelpPanel
            triggerRect={triggerRect}
            resolvedContent={resolvedContent}
            title={title}
            onClose={() => setOpen(false)}
          />,
          document.body
        )
      }
    </>
  );
}
