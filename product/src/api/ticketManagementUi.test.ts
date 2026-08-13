import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import type { TicketScoreboardResponse } from './backendData';
import { ManualPlayerScoreboard } from '../components/AnalyticsLedger';
import { TicketGrid } from '../components/AnalyticsLedgerTicketGrid';

const ledger = readFileSync(
  new URL('../components/AnalyticsLedger.tsx', import.meta.url),
  'utf8',
);
const ticketGrid = readFileSync(
  new URL('../components/AnalyticsLedgerTicketGrid.tsx', import.meta.url),
  'utf8',
);
const scoreboardComponent = ledger.match(
  /function ManualPlayerScoreboard[\s\S]*?const themeVariables/,
)?.[0] ?? '';

test('ticket management exposes English edit and confirmed-delete states', () => {
  for (const expected of [
    'Edit Ticket',
    'Save Changes',
    'Ticket updated securely.',
    'Delete?',
    'Confirm deletion of ticket',
    'Cancel ticket deletion',
    'Ticket deleted.',
  ]) {
    assert.ok(ledger.includes(expected));
  }

  assert.match(ledger, /canManageManualTicket\(tip, ticketTargetDraw\)/);
  assert.match(ledger, /ticketMutationId !== null \|\| isTicketSaving/);
});

test('manual player comparison separates player and engine best hits', () => {
  for (const expected of [
    'Hit Quality Ranking · Draw',
    'Submission Ranking · Draw',
    'Ranked by tickets submitted',
    'Engine Universe benchmark',
    'Best-hit benchmark',
    'player.best_hit',
    'player.ticket_count',
  ]) {
    assert.match(scoreboardComponent, new RegExp(expected.replace('.', '\\.')));
  }

  assert.doesNotMatch(scoreboardComponent, /player\.user_id/);
  assert.match(scoreboardComponent, /player\.player_name/);
  assert.match(
    scoreboardComponent,
    /Showing \{scoreboard\.returned_player_count\} of \{scoreboard\.player_count\}/,
  );
  assert.match(scoreboardComponent, /scoreboard\.best_engine_hit/);
  assert.doesNotMatch(scoreboardComponent, /best_engine_hits/);
  assert.match(scoreboardComponent, /isCompleted \? player\.rank : index \+ 1/);
  assert.match(scoreboardComponent, /isCompleted && \([\s\S]*?Best \{player\.best_hit/);
  assert.doesNotMatch(scoreboardComponent, /Best \{player\.best_hit \?\? 'Pending'\}/);
});

test('pending draws rank players by submission count without hit or engine claims', () => {
  const pending: TicketScoreboardResponse = {
    draw_id: 1968,
    status: 'waiting_for_result',
    player_count: 1,
    total_tickets: 2,
    returned_player_count: 1,
    has_more: false,
    players: [{
      rank: 1,
      player_name: 'You',
      is_current_user: true,
      ticket_count: 2,
      best_hit: null,
      best_hit_main: null,
      best_hit_core: null,
    }],
    best_engine_hit: null,
  };
  const markup = renderToStaticMarkup(createElement(ManualPlayerScoreboard, {
    drawId: 1968,
    scoreboard: pending,
    isLoading: false,
    error: null,
  }));

  assert.match(markup, /Submission Ranking · Draw 1968/);
  assert.match(markup, /2 tickets/);
  assert.match(markup, /#1/);
  assert.doesNotMatch(markup, /Hit Quality Ranking|Engine Universe|Best Pending/);
});

test('completed draws show ranked player and engine best hits', () => {
  const completed: TicketScoreboardResponse = {
    draw_id: 1967,
    status: 'completed',
    player_count: 2,
    total_tickets: 5,
    returned_player_count: 2,
    has_more: false,
    players: [{
      rank: 1,
      player_name: 'You',
      is_current_user: true,
      ticket_count: 3,
      best_hit: '4+1',
      best_hit_main: 4,
      best_hit_core: 1,
    }, {
      rank: 2,
      player_name: 'Player C92A',
      is_current_user: false,
      ticket_count: 2,
      best_hit: '2+0',
      best_hit_main: 2,
      best_hit_core: 0,
    }],
    best_engine_hit: {
      match_category: '5+0',
      match_main: 5,
      match_core: 0,
      hit_count: 1,
    },
    best_engine_hits: [
      {
        match_category: '5+0',
        match_main: 5,
        match_core: 0,
        hit_count: 1,
      },
      {
        match_category: '4+2',
        match_main: 4,
        match_core: 2,
        hit_count: 3,
      },
    ],
  };
  const markup = renderToStaticMarkup(createElement(ManualPlayerScoreboard, {
    drawId: 1967,
    scoreboard: completed,
    isLoading: false,
    error: null,
  }));

  assert.match(markup, /Hit Quality Ranking · Draw 1967/);
  assert.match(markup, /Engine Universe best hit benchmark/);
  assert.match(markup, /Best 5\+0/);
  assert.doesNotMatch(markup, /Best 4\+2/);
  assert.match(markup, /Best 4\+1/);
  assert.match(markup, /Player C92A/);
  assert.match(markup, /Best 2\+0/);
  assert.match(markup, /#1/);
  assert.match(markup, /#2/);
});

test('My Tickets keeps the ranking but hides universe-only analytics sections', () => {
  const offcanvas = ledger.slice(ledger.indexOf('{/* Offcanvas Detail View'));
  const scrollContent = offcanvas.slice(offcanvas.indexOf('overflow-y-auto p-8'));
  const scoreboardIndex = scrollContent.indexOf('<ManualPlayerScoreboard');
  const hitLadderIndex = scrollContent.indexOf('{/* Quality-first hit ladder */}');

  assert.ok(scoreboardIndex >= 0);
  assert.ok(hitLadderIndex > scoreboardIndex);
  assert.match(
    scrollContent,
    /activeTab === 'draws' && isCatalogDraw\(selectedDraw\) && \([\s\S]*?Hit Quality Ladder/,
  );
  assert.match(
    scrollContent,
    /activeTab === 'draws' && isCatalogDraw\(selectedDraw\) && \([\s\S]*?Evaluation Modules/,
  );
  assert.match(ledger, /activeTab === 'tips' && isCatalogDraw\(selectedDraw\)[\s\S]*?includeAllPlayers: true/);
});

test('past cards and evaluated details show only the best qualifying manual wins', () => {
  assert.match(
    ledger,
    /selectTopQualifyingManualTicketHits\(group\.items, 3\)/,
  );
  assert.match(
    ledger,
    /selectTopQualifyingManualTicketHits\(offcanvasTips, 10\)/,
  );
  assert.match(ledger, /Top 3 winning tickets/);
  assert.match(ledger, /My Top 10 Winning Tickets/);
  assert.match(ledger, /Manual tickets only · 2\+0 or better · best hit first/);
  assert.match(ledger, /No winning manual ticket at 2\+0 or better/);
});

test('evaluated ticket provenance fails closed for edit controls', () => {
  assert.match(ledger, /source: item\.source_type/);
  assert.match(ledger, /item\.source_type === 'manual'/);
  assert.match(ledger, /item\.source_type === 'purchased'/);
});

test('ticket rollover, mobile layout, and mutation feedback stay usable', () => {
  assert.match(ledger, /fetchEngineStatus\(controller\.signal\)/);
  assert.match(ledger, /readEnginePresentationDrawId\(engineStatus\)/);
  assert.doesNotMatch(ledger, /fetchAdvisorConfig/);
  assert.match(ledger, /engineStatus\.lifecycle_status === 'WAITING_FOR_SPRINTSTATE'/);
  assert.match(ledger, /Preparing \/ upcoming draw/);
  assert.match(ledger, /window\.setInterval\(synchronize, 30_000\)/);
  assert.match(ledger, /ticketTargetDrawRef\.current = nextDraw/);
  assert.match(ledger, /pending\.request\.draw_id === ticketTargetDrawRef\.current/);
  assert.match(ledger, /result\.draw_id === ticketTargetDrawRef\.current/);
  assert.match(ledger, /presentationDraw === ticketTargetDraw/);
  assert.match(ledger, /clearCompletedAdvisorTipScenarioGeneration\(window\.localStorage\)/);
  assert.match(ledger, /ticketErrorDetail\(error\) === 'ticket_draw_closed'/);
  assert.match(ledger, /role=\{ticketSaveNotice\.tone === 'error' \? 'alert' : 'status'\}/);
  assert.match(ticketGrid, /grid-cols-5[^\n]*sm:grid-cols-10/);
  assert.match(ticketGrid, /aria-pressed=\{isSelected\}/);
});

test('upcoming ticket management stays full width and opens AI generation in its own workspace', () => {
  const offcanvas = ledger.slice(ledger.indexOf('{/* Offcanvas Detail View'));
  const workspaceStart = ledger.indexOf('aria-label="Upcoming ticket workspace"');
  const workspaceEnd = ledger.indexOf(
    "activeTab === 'tips'",
    workspaceStart + 1,
  );
  const workspace = ledger.slice(workspaceStart, workspaceEnd);
  const generatorWorkspaceStart = ledger.indexOf('aria-label="AI ticket generator workspace"');
  const generatorWorkspaceEnd = ledger.indexOf('{/* Offcanvas Detail View', generatorWorkspaceStart);
  const generatorWorkspace = ledger.slice(generatorWorkspaceStart, generatorWorkspaceEnd);
  const editorGrid = workspace.match(/<TicketGrid[\s\S]*?\/>/)?.[0] ?? '';

  assert.match(ledger, /open=\{Boolean\(selectedDraw && !isForecastTicketPanel\)\}/);
  assert.match(workspace, /aria-label="AI ticket generator launcher"/);
  assert.match(workspace, /Open generator/);
  assert.match(generatorWorkspace, /<ReportTicketGenerator/);
  assert.match(ledger, /variant="workspace"/);
  assert.match(workspace, /aria-label="Manual tickets for upcoming draw"/);
  assert.match(workspace, /id="manual-ticket-editor"/);
  assert.doesNotMatch(workspace, /variant="side-panel"/);
  assert.match(offcanvas, /tip\.source !== 'manual'/);
  assert.match(offcanvas, /aria-label="Tickets for selected draw"/);
  assert.match(offcanvas, /selectedDraw !== null && \(\s*<section/);
  assert.doesNotMatch(offcanvas, /Personal Ledger Grid/);
  assert.match(workspace, /max-h-\[480px\][^"\n]*overflow-y-auto/);
  assert.match(editorGrid, /onToggleNumber=\{handleToggleNumber\}/);
  assert.doesNotMatch(editorGrid, /compact/);
  assert.match(
    offcanvas,
    /isCatalogDraw\(selectedDraw\) && \(\s*<div className="flex flex-col gap-4">/,
  );
  assert.match(workspace, /grid-cols-1[^"\n]*lg:grid-cols-2/);
});

test('compact ticket grid keeps every number accessible where compact summaries are used', () => {
  const markup = renderToStaticMarkup(createElement(TicketGrid, {
    numbers: [1, 2, 3, 4, 5],
    cores: [1, 2],
    compact: true,
  }));

  assert.match(markup, /grid-cols-5 gap-1 sm:grid-cols-10/);
  assert.match(markup, /h-7 w-7/);
  assert.equal((markup.match(/aria-label="Main number /g) ?? []).length, 50);
  assert.equal((markup.match(/aria-label="Core number /g) ?? []).length, 12);
});
