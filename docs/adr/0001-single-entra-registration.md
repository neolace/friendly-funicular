# ADR 0001: Single Entra app registration

- **Status:** Accepted
- **Date:** 2026-09-23

## Decision

Use one Microsoft Entra tenant and one tightly coupled Entra application
registration for both the React SPA and the API resource in the initial
implementation.

## Reason

This is a stated project constraint. It keeps the initial identity
configuration small for a single product with one browser client and one API
authorization model.

## Trade-off

Microsoft guidance generally favours separate registrations for user-facing
applications and APIs, because separation improves least privilege and reduces
blast radius. The single-registration approach couples the browser identity
configuration more tightly to the API resource configuration.

## Guardrails

- Keep the application single-tenant.
- Use Authorization Code Flow with PKCE.
- Never add a client secret to the SPA.
- Require explicit API scopes.
- Validate signature, issuer, audience, tenant, lifetime and scopes in Lambda.
- Use stable claims for business authorization.
- Maintain named owners.
- Review permissions and redirect URIs regularly.

## Mandatory revisit triggers

- Another client consumes the API.
- Machine-to-machine authentication is needed.
- API permissions become materially more privileged.
- Ownership separates across teams.
- Partner or external access is introduced.
- Security review requires independent compromise boundaries.
