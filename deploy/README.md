# Current OCI Compose deployment

| Environment | Branch | Compose project / service | Existing volume | HTTPS |
| --- | --- | --- | --- | --- |
| production | main | deploy / festival | deploy_festival-data | https://eniveil.com |
| qa | qa | murder-parker-qa / festival-qa | murder-parker-qa_festival-qa-data | https://qa-mindul-murder-mystery.duckdns.org |

The deployment workflow validates the app and deployment tests, then sends
`deploy-compose.py` over SSH. It clones an immutable commit into
`~/.local/share/mindul-murder-deploy/<environment>/<sha>/source`. Existing live
source snapshots are not overwritten. Obsolete branch heads are rejected.

## GitHub configuration

Set `SSH_PRIVATE_KEY` in repository secrets or each GitHub Environment
(`production`, `qa`). OpenSSH plaintext and base64-encoded keys are supported.
Optional secrets: `SSH_HOST` (default `129.154.220.233`), `SSH_USER` (default
`ubuntu`), `SSH_PORT` (default `22`). `deploy/ssh_known_hosts` pins the server's
Ed25519 public host key; update it explicitly if the server key rotates.

- 운영 분석은 환경/저장소 변수 `GTM_CONTAINER_ID`를 사용하며 미설정이면 `GTM-56Q5K95G`를 사용한다. QA 분석은 선택 변수 `QA_GTM_CONTAINER_ID`만 사용하며, 미설정이면 분석 UI와 태그를 비활성화한다. QA는 운영 변수·기본 컨테이너로 자동 대체하지 않는다. 두 환경 모두 사용자 동의 후에만 태그를 로드한다.
`APP_ORIGIN` is fixed to the URLs above. Environment files remain on the server:
`~/murder-parker/deploy/.env` for production and
`~/murder-parker-qa/deploy/.env` for QA, when present.

**Not required:** OCI_REGISTRY, OCI_REGISTRY_HOST, KUBERNETES_ENABLED,
KUBECONFIG_B64, OCIR_USERNAME, OCIR_AUTH_TOKEN. `deploy/k8s` is a separate
reference configuration and is not applied by this workflow. Temporal Worker
is not automatically deployed by this Compose workflow.

## Data and observability

The existing database volumes are external and must already exist. The script
keeps existing project/service identities, loopback ports 3000/3001 and aliases
`mindul-murder-mystery` / `mindul-murder-mystery-qa` on `mindul-net`.
Caddy, Prometheus scraping and OTLP forwarding therefore retain their endpoints.
The app retains `/metrics` and Faro initialization for the current Grafana dashboards.
The GA variable does not control Faro collection.

The server requires Docker Compose, Git, Python and the existing
`~/mindul-ai-infra/ops/mindul_ops.py` backup tool. Production and QA builds are
serialized. Before starting new code, the script creates an encrypted backup.
It waits for container health and public HTTPS `/api/health`; failure restores
the previous image and Compose definition. It never deletes database volumes.
Application rollback does not reverse schema/data migrations already executed;
use the encrypted backup and infrastructure restore runbook for database recovery.
Active WebSocket connections reconnect during deployment.

Manual deployment of a reviewed current branch head:

```bash
python3 deploy/deploy-compose.py qa <full-40-character-qa-commit>
python3 deploy/deploy-compose.py production <full-40-character-main-commit>
```

Deployment unit tests: `python3 -m unittest discover -s deploy/tests -v`.
