// ---------------------------------------------------------------
// scripts/test-store.js - checks the user list (no Redis needed).
// Run with:  npm run test:store
// ---------------------------------------------------------------
const assert = require("node:assert/strict");
const { createMemoryStore } = require("../services/userStore");

async function main() {
  let passed = 0;
  const check = async (name, fn) => {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  };

  const store = createMemoryStore();

  await check("a saved user can be read back", async () => {
    await store.set("s1", { id: "s1", name: "Asha", room: "r1", x: 100, y: 100 });
    assert.equal((await store.get("s1")).name, "Asha");
  });

  await check("listing a room returns only its people", async () => {
    await store.set("s2", { id: "s2", name: "Ben", room: "r1", x: 160, y: 100 });
    await store.set("s3", { id: "s3", name: "Cara", room: "r2", x: 100, y: 100 });
    const names = (await store.listInRoom("r1")).map((u) => u.name).sort();
    assert.deepEqual(names, ["Asha", "Ben"]);
  });

  await check("deleting a user removes them from the list", async () => {
    await store.delete("s2");
    assert.equal(await store.get("s2"), null);
    assert.equal((await store.listInRoom("r1")).length, 1);
  });

  await check("changes to a returned copy do not change the stored user", async () => {
    const copy = await store.get("s1");
    copy.x = 999;
    assert.equal((await store.get("s1")).x, 100);
  });

  console.log(`\n${passed} checks passed`);
}

main().catch((error) => {
  console.error("TEST FAILED:", error.message);
  process.exit(1);
});
