# Nubi : Nginx Universal Bridge Interface

<div align="center">
  <img src="web/public/logo.svg" alt="Nubi" width="500">
  <h1>Nubi</h1>
  <p><strong>Nginx Universal Bridge Interface</strong></p>
</div>

testing

## Quickstart Prototype

- Install Go 1.21+ and ensure the `go` binary is on your `PATH`.
- Install Node.js 18+ and ensure `npm` is available.
- Provision the web UI:
  - `cd web`
  - `npm install`
  - `npm run build`
- Ensure `nginx` is installed and reachable from the machine running `nubid`.
- From the repository root start the daemon: `go run ./cmd/nubid` (serves `web/dist` by default).
- Open `http://localhost:8080` and trigger nginx status/config test/reload via the React controls.
