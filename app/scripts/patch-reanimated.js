const fs = require('fs');
const path = require('path');

// Patch Reanimated to allow builds without New Architecture.
// It rewrites the assertNewArchitectureEnabledTask to be a no-op.

const target = path.join(__dirname, '..', 'node_modules', 'react-native-reanimated', 'android', 'build.gradle');

const before = `task assertNewArchitectureEnabledTask {
    onlyIf { !IS_NEW_ARCHITECTURE_ENABLED }
    doFirst {
        throw new GradleException("[Reanimated] Reanimated requires new architecture to be enabled. Please enable it by setting \`newArchEnabled\` to \`true\` in \`gradle.properties\`.")
    }
}

preBuild.dependsOn(assertNewArchitectureEnabledTask)`;

const after = `// Patched: allow building without New Architecture; NA is off for IAP compatibility.
task assertNewArchitectureEnabledTask {
    onlyIf { false }
    doFirst { }
}
// preBuild.dependsOn(assertNewArchitectureEnabledTask) -- disabled`;

try {
  const contents = fs.readFileSync(target, 'utf8');
  if (contents.includes(after)) {
    console.log('[patch-reanimated] Already patched.');
    process.exit(0);
  }
  if (!contents.includes(before)) {
    console.warn('[patch-reanimated] Expected pattern not found; skipping.');
    process.exit(0);
  }
  const next = contents.replace(before, after);
  fs.writeFileSync(target, next, 'utf8');
  console.log('[patch-reanimated] Patch applied.');
} catch (err) {
  console.warn('[patch-reanimated] Failed to patch:', err?.message || err);
  process.exit(0); // do not fail install
}

