#!/usr/bin/env bash
# Download the ontologies and the W3C parser test suites used by the tests into test/data (not committed).
# They are third-party works under their own licenses.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p data && cd data
get() { mkdir -p "$1"; [ -s "$1/$3" ] || curl -fsSL --max-time 300 -o "$1/$3" "$2"; echo "$1/$3"; }
get pizza  https://raw.githubusercontent.com/owlcs/pizza-ontology/master/pizza.owl pizza.owl
get koala  https://raw.githubusercontent.com/owlcs/owlapi/version5/contract/src/test/resources/koala.owl koala.owl
get bfo    https://raw.githubusercontent.com/BFO-ontology/BFO/master/bfo.owl bfo.owl
get sosa   https://raw.githubusercontent.com/w3c/sdw/gh-pages/ssn/integrated/ssn.ttl ssn.ttl
get gist   https://raw.githubusercontent.com/semanticarts/gist/develop/ontologies/gistCore.ttl gistCore.ttl
get schema https://raw.githubusercontent.com/schemaorg/schemaorg/main/data/releases/29.0/schemaorg-current-https.ttl schemaorg.ttl
get brick  https://github.com/BrickSchema/Brick/releases/download/v1.4.4/Brick.ttl Brick.ttl
get envo   https://raw.githubusercontent.com/EnvironmentOntology/envo/master/envo.owl envo.owl
get doid   https://raw.githubusercontent.com/DiseaseOntology/HumanDiseaseOntology/main/src/ontology/doid.owl doid.owl
[ -d rdf-tests ] || git clone --depth 1 -q https://github.com/w3c/rdf-tests.git
echo "done"
