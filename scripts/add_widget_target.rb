#!/usr/bin/env ruby
# add_widget_target.rb — Adds OpenInviteTodayWidget extension target to the Xcode project
# Uses xcodeproj gem (bundled with CocoaPods) for safe pbxproj manipulation.
#
# Usage: ruby scripts/add_widget_target.rb

require 'xcodeproj'

PROJECT_PATH = File.expand_path('../../ios/OpenInvite.xcodeproj', __FILE__)
WIDGET_NAME = 'OpenInviteTodayWidgetExtension'
WIDGET_DIR = 'OpenInviteTodayWidget'
BUNDLE_ID = 'com.vibecode.openinvite.0qi5wk.widget'
APP_GROUP = 'group.com.vibecode.openinvite.0qi5wk'
DEPLOYMENT_TARGET = '16.0'  # WidgetKit requires iOS 16+ for accessoryRectangular

project = Xcodeproj::Project.open(PROJECT_PATH)

# Check if target already exists
if project.targets.any? { |t| t.name == WIDGET_NAME }
  puts "Target '#{WIDGET_NAME}' already exists — skipping."
  exit 0
end

# Create the widget extension target
widget_target = project.new_target(
  :app_extension,
  WIDGET_NAME,
  :ios,
  DEPLOYMENT_TARGET
)

# Add source files
widget_group = project.main_group.new_group(WIDGET_DIR, WIDGET_DIR)
swift_file = widget_group.new_file("#{WIDGET_DIR}/OpenInviteTodayWidget.swift")
widget_target.add_file_references([swift_file])

# Add assets
assets = widget_group.new_file("#{WIDGET_DIR}/Assets.xcassets")
widget_target.resources_build_phase.add_file_reference(assets)

# Add Info.plist
info_plist = widget_group.new_file("#{WIDGET_DIR}/Info.plist")

# Also add the native bridge files to the main app target
main_target = project.targets.find { |t| t.name == 'OpenInvite' }
if main_target
  app_group = project.main_group.children.find { |g| g.display_name == 'OpenInvite' }
  if app_group
    # Add WidgetBridge.swift
    bridge_swift = app_group.new_file('OpenInvite/WidgetBridge.swift')
    main_target.source_build_phase.add_file_reference(bridge_swift)
    
    # Add WidgetBridge.m  
    bridge_m = app_group.new_file('OpenInvite/WidgetBridge.m')
    main_target.source_build_phase.add_file_reference(bridge_m)
  end
end

# Configure build settings for widget target
widget_target.build_configurations.each do |config|
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = BUNDLE_ID
  config.build_settings['INFOPLIST_FILE'] = "#{WIDGET_DIR}/Info.plist"
  config.build_settings['SWIFT_VERSION'] = '5.0'
  config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = DEPLOYMENT_TARGET
  config.build_settings['CODE_SIGN_ENTITLEMENTS'] = 'OpenInviteTodayWidgetExtension.entitlements'
  config.build_settings['CURRENT_PROJECT_VERSION'] = '1'
  config.build_settings['MARKETING_VERSION'] = '1.0'
  config.build_settings['GENERATE_INFOPLIST_FILE'] = 'NO'
  config.build_settings['TARGETED_DEVICE_FAMILY'] = '1,2'
  config.build_settings['ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME'] = 'AccentColor'
  config.build_settings['ASSETCATALOG_COMPILER_WIDGET_BACKGROUND_COLOR_NAME'] = 'WidgetBackground'
  config.build_settings['SKIP_INSTALL'] = 'YES'
  
  if config.name == 'Debug'
    config.build_settings['SWIFT_OPTIMIZATION_LEVEL'] = '-Onone'
    config.build_settings['SWIFT_ACTIVE_COMPILATION_CONDITIONS'] = 'DEBUG'
  end
end

# Add widget as dependency of the main app and embed it
if main_target
  main_target.add_dependency(widget_target)
  
  # Create "Embed App Extensions" build phase
  embed_phase = main_target.build_phases.find { |p| p.respond_to?(:name) && p.name == 'Embed App Extensions' }
  unless embed_phase
    embed_phase = project.new(Xcodeproj::Project::Object::PBXCopyFilesBuildPhase)
    embed_phase.name = 'Embed App Extensions'
    embed_phase.symbol_dst_subfolder_spec = :plug_ins
    main_target.build_phases << embed_phase
  end
  embed_phase.add_file_reference(widget_target.product_reference, true)
  
  # Set the embed attribute for signing
  build_file = embed_phase.files.last
  build_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }
end

project.save

puts "✅ Widget target '#{WIDGET_NAME}' added successfully."
puts "   Bundle ID: #{BUNDLE_ID}"
puts "   Deployment target: #{DEPLOYMENT_TARGET}"
puts "   App Group: #{APP_GROUP}"
