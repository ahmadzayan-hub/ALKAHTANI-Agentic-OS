"""Test approval HTTP requests against a disposable local PostgreSQL cluster."""
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import tempfile


def main():
    binaries = {name: shutil.which(name) for name in ("initdb", "pg_ctl", "psql", "node")}
    if not all(binaries.values()):
        raise SystemExit("Put PostgreSQL bin and Node on PATH before running this test.")
    root = Path(__file__).resolve().parents[1]
    results = root / "test-results"
    results.mkdir(exist_ok=True)
    work = Path(tempfile.mkdtemp(prefix="agent-approval-", dir=results)).resolve()
    data = work / "data"
    log = results / "agent-approval-postgres.log"
    env = {k: v for k, v in os.environ.items()
           if not k.upper().startswith("PG") and k.upper() != "DATABASE_URL"}
    password = secrets.token_urlsafe(32)
    password_file = work / "password"
    password_file.write_text(password, encoding="ascii")
    with socket.socket() as reservation:
        reservation.bind(("127.0.0.1", 0))
        port = reservation.getsockname()[1]
    env.update(PGHOST="127.0.0.1", PGPORT=str(port), PGUSER="approval_test",
               PGDATABASE="postgres", PGPASSWORD=password, PGCONNECT_TIMEOUT="5")
    started = False

    def run(command, *args, capture=False):
        return subprocess.run([binaries[command], *map(str, args)], env=env, cwd=root,
                              check=True, timeout=90, text=True, capture_output=capture)

    try:
        run("initdb", "-D", data, "-U", "approval_test", "--no-locale", "--encoding=UTF8",
            "--auth-local=trust", "--auth-host=scram-sha-256", f"--pwfile={password_file}")
        with (data / "postgresql.conf").open("a", encoding="utf8") as config:
            config.write("\nunix_socket_directories = ''\n")
        run("pg_ctl", "-D", data, "-l", log, "-o", f"-h 127.0.0.1 -p {port}", "-w", "start")
        started = True
        actual = run("psql", "-XAt", "-c", "show data_directory", capture=True).stdout.strip()
        if Path(actual).resolve() != data.resolve():
            raise RuntimeError("Connected server is not this invocation's test cluster.")
        # The test refuses to run without this disposable-cluster marker. No
        # caller-supplied DATABASE_URL or operator credential is used.
        env.update(APPROVAL_TEST_CLUSTER=str(data), OPERATOR_TOKEN="synthetic-approval-test")
        run("node", "--import", "tsx", "--test", "apps/api/test/agent-approval.integration.ts")
    finally:
        if started:
            run("pg_ctl", "-D", data, "-m", "immediate", "-w", "stop")
        assert work.is_relative_to(results.resolve()) and work.name.startswith("agent-approval-")
        shutil.rmtree(work)


if __name__ == "__main__":
    main()
