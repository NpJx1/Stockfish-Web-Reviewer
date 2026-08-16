import http.server
import socketserver
import urllib.request
import urllib.error
import ssl
import json

PORT = 8000

try:
    import certifi
    SSL_CONTEXT = ssl.create_default_context(cafile=certifi.where())
except ImportError:
    SSL_CONTEXT = ssl.create_default_context()
    print("[warn] certifi not installed — run: pip3 install certifi")

class SecureHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Unlock SharedArrayBuffer headers
        self.send_header("Cross-Origin-Embedder-Policy", "credentialless")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        super().end_headers()

    def _send_json_error(self, status, message):
        print(f"[get_games] ERROR {status}: {message}")
        body = json.dumps({"error": message}).encode('utf-8')
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path == "/get_games":
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                data = json.loads(post_data.decode('utf-8'))
            except json.JSONDecodeError:
                self._send_json_error(400, "Invalid JSON payload received.")
                return

            target_url = data.get("url")
            print(f"[get_games] Fetching: {target_url}")

            try:
                # Upgraded User-Agent format: Chess.com will block generic bot names
                req = urllib.request.Request(
                    target_url,
                    headers={
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ChessAnalysisApp/1.0',
                        'Accept': 'application/json'
                    }
                )
                with urllib.request.urlopen(req, timeout=10, context=SSL_CONTEXT) as response:
                    res_body = response.read()

                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(res_body)

            except urllib.error.HTTPError as e:
                # Graceful extraction of error details
                try:
                    detail = e.read().decode('utf-8', errors='replace')
                except Exception:
                    detail = "No additional details provided."
                
                # Check for explicit 404 edge-cases
                if e.code == 404:
                    self._send_json_error(e.code, "404 Not Found: Ensure the username is correct and games were played during this exact month.")
                else:
                    self._send_json_error(e.code, f"Chess.com returned {e.code}: {detail}")

            except urllib.error.URLError as e:
                self._send_json_error(502, f"Could not reach Chess.com: {e.reason}")

            except Exception as e:
                self._send_json_error(500, f"Unexpected server error: {str(e)}")
        else:
            super().do_POST()

with socketserver.TCPServer(("", PORT), SecureHandler) as httpd:
    print(f"Server unlocked with Proxy! Running at http://localhost:{PORT}")
    httpd.serve_forever()