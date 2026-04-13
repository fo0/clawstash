---
name: gitnexus-explore
description: "Use when the user wants to understand, navigate, or explore the codebase. Examples: \"How does X work?\", \"Where is Y defined?\", \"Show me the flow for Z\", \"What calls this function?\", \"Explain this module\""
---

# Codebase Exploration with GitNexus

## When to Use

- "How does X work?"
- "Where is Y defined?"
- "What calls this function?"
- "Show me the flow for Z"
- "Explain this module/service/component"
- Any task requiring understanding of code structure, dependencies, or execution flow

## Workflow

1. **Start broad** -- `gitnexus_query({query: "natural language question"})` to find relevant code
2. **Zoom in** -- `gitnexus_context({name: "SymbolName"})` to see all references (callers, callees, types)
3. **Trace flow** -- `gitnexus_impact({target: "SymbolName", direction: "downstream"})` to follow execution
4. **Custom queries** -- `gitnexus_cypher` for complex relationship questions

> If "Index is stale" -> run `npx gitnexus analyze` in terminal.

## Tool Selection Guide

| Question | Tool | Example |
|----------|------|---------|
| "Where is X?" / "How does X work?" | `gitnexus_query` | `gitnexus_query({query: "user authentication flow"})` |
| "What uses X?" / "What does X depend on?" | `gitnexus_context` | `gitnexus_context({name: "AuthService"})` |
| "What's affected if I change X?" | `gitnexus_impact` | `gitnexus_impact({target: "AuthService", direction: "upstream"})` |
| "Show all functions that call Y and are called by Z" | `gitnexus_cypher` | Custom Cypher query |

## Examples

### Understand a module
```
gitnexus_query({query: "payment processing"})
-> Found: PaymentService, StripeAdapter, PaymentController
-> Processes: CheckoutFlow, RefundFlow

gitnexus_context({name: "PaymentService"})
-> Incoming: PaymentController.processPayment(), WebhookHandler.handleStripeEvent()
-> Outgoing: StripeAdapter.charge(), OrderService.updateStatus()
```

### Trace execution flow
```
gitnexus_impact({target: "processPayment", direction: "downstream"})
-> d=1: StripeAdapter.charge, OrderService.updateStatus, NotificationService.sendReceipt
-> d=2: EmailProvider.send, DatabaseService.save
-> Affected Processes: CheckoutFlow, NotificationFlow
```
