#!/bin/bash
set -euo pipefail

if [[ "$EAS_BUILD_PLATFORM" != "ios" ]]; then
  echo ">>> Skipping lottie-ios fix (not iOS)"
  exit 0
fi

echo ">>> [eas-build-post-install] Applying lottie-ios wholemodule fix..."

# Layer 1: Patch xcconfig files (these OVERRIDE project-level settings)
for config in ios/Pods/Target\ Support\ Files/lottie-ios/lottie-ios.*.xcconfig; do
  if [[ -f "$config" ]]; then
    if ! grep -q 'SWIFT_COMPILATION_MODE' "$config"; then
      echo "SWIFT_COMPILATION_MODE = wholemodule" >> "$config"
      echo "  ✓ Patched xcconfig: $config"
    else
      sed -i '' 's/SWIFT_COMPILATION_MODE = .*/SWIFT_COMPILATION_MODE = wholemodule/' "$config"
      echo "  ✓ Updated xcconfig: $config"
    fi
  fi
done

# Layer 2: Also patch Pods.xcodeproj (belt and suspenders)
ruby << 'RUBY'
require 'xcodeproj'

project_path = File.join('ios', 'Pods', 'Pods.xcodeproj')
unless File.exist?(project_path)
  puts "ERROR: #{project_path} not found"
  exit 1
end

project = Xcodeproj::Project.open(project_path)
found = false

project.targets.each do |target|
  if target.name == 'lottie-ios'
    found = true
    target.build_configurations.each do |config|
      config.build_settings['SWIFT_COMPILATION_MODE'] = 'wholemodule'
      config.build_settings['SWIFT_WHOLE_MODULE_OPTIMIZATION'] = 'YES'
      puts "  ✓ Set wholemodule on lottie-ios [#{config.name}]"
    end
  end
end

if found
  project.save
  puts ">>> lottie-ios xcodeproj fix applied and saved."
else
  puts "WARNING: lottie-ios target not found in Pods project."
end
RUBY

echo ">>> [eas-build-post-install] Done."
