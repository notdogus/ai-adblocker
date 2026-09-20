"""Check release archives without printing credentials or archive contents."""
import os
import re
import json
import zipfile
from pathlib import Path

version = json.loads(Path('package.json').read_text())['version']
archives = [Path('.output') / f'ai-adblocker-{version}-{kind}.zip'
            for kind in ('chrome', 'firefox', 'sources')]
if not all(archive.is_file() for archive in archives):
    raise SystemExit('Missing a browser or sources archive for the current package version.')
secret = os.environ.get('TYPESAFE_API_KEY', '').encode()
key_pattern = re.compile(rb'apikey_[0-9a-f]{24,}_[0-9a-f]{24,}', re.I)
for archive in archives:
    with zipfile.ZipFile(archive) as bundle:
        for name in bundle.namelist():
            parts = Path(name).parts
            if any(p.startswith('.') or p in ('test-results', 'node_modules', 'coverage', 'playwright-report') for p in parts):
                raise SystemExit(f'Private or unexpected file in {archive.name}: {name}')
            data = bundle.read(name)
            if (secret and secret in data) or key_pattern.search(data):
                raise SystemExit(f'Credential detected in {archive.name}; package rejected.')
        if 'sources' not in archive.name:
            for required in ('manifest.json', 'LICENSE.txt', 'THIRD_PARTY_NOTICES.txt'):
                if required not in bundle.namelist():
                    raise SystemExit(f'Missing {required} in {archive.name}')
print('Three release archives verified: no credentials or private artifacts; licenses included.')
