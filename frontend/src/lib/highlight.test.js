import assert from "node:assert/strict";
import test from "node:test";
import { highlight, languageFor } from "./highlight.js";

test("fence names and their aliases", () => {
  for (const name of ["sh", "bash", "SHELL", "zsh", "bash title=x"]) assert.equal(languageFor(name), "shell", name);
  assert.equal(languageFor("yml"), "yaml");
  assert.equal(languageFor("json"), "json");
  assert.equal(languageFor("toml"), "toml");
  assert.equal(languageFor("cobol"), null);
  assert.equal(languageFor(""), null);
  assert.equal(languageFor(undefined), null);
  assert.equal(languageFor("constructor"), null);
});

const samples = {
  shell: 'echo "yo"\n# a comment\nexport A=1\n',
  json: '{\n  "a": [1, true, null],\n  "b": "x"\n}\n',
  yaml: "name: x\nlist:\n  - 1\n  - two # note\n",
  toml: '[table]\nkey = "value"\nn = 3\n',
};

for (const [lang, code] of Object.entries(samples)) {
  test(`${lang}: runs join back into the code and some are coloured`, async () => {
    const runs = await highlight(code, lang);
    assert.equal(runs.map((r) => r.text).join(""), code);
    assert.ok(
      runs.some((r) => r.cls.startsWith("tok-")),
      "no coloured run",
    );
  });
}

test("shell colours the string in echo", async () => {
  const runs = await highlight('echo "yo"', "shell");
  assert.ok(
    runs.some((r) => r.text === '"yo"' && /tok-string/.test(r.cls)),
    JSON.stringify(runs),
  );
});

test("empty code gives no runs", async () => {
  assert.deepEqual(await highlight("", "shell"), []);
});
