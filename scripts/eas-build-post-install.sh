#!/bin/bash
set -euo pipefail

if [[ "$EAS_BUILD_PLATFORM" != "ios" ]]; then
  echo ">>> Skipping lottie-ios fix (not iOS)"
  exit 0
fi

echo ">>> [eas-build-post-install] Applying lottie-ios wholemodule fix to Pods.xcodeproj..."

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
  puts ">>> lottie-ios fix applied and saved."
else
  puts "WARNING: lottie-ios target not found in Pods project."
  puts "Available targets: #{project.targets.map(&:name).join(', ')}"
end
RUBY

echo ">>> [eas-build-post-install] Done."
