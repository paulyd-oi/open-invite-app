/**
 * CoverMediaPickerSheet — bottom-sheet media picker for event cover photos.
 *
 * 3 tabs: Featured · GIFs · My Uploads
 * Features: search bar, category chip rail, 2-column thumbnail grid, upload CTA.
 * Selecting an item calls onSelectCover immediately (no confirm step).
 */
import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  FlatList,
  TextInput,
  Dimensions,
} from "react-native";
import { Image as ExpoImage } from "expo-image";
import * as Haptics from "expo-haptics";
import BottomSheet from "@/components/BottomSheet";
import { Search, Upload, X, ImagePlus } from "@/ui/icons";
import { COVER_CATEGORIES, FEATURED_COVERS, MOCK_GIFS } from "./coverMedia.data";
import type { CoverMediaItem } from "./coverMedia.types";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type TabId = "featured" | "gifs" | "uploads";

interface CoverMediaPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called when user picks a featured/gif item. Provides the full-res URL. */
  onSelectCover: (item: CoverMediaItem) => void;
  /** Called when user picks a local image from their library. Provides file URI. */
  onPickLocalImage: () => void;
  /** Currently selected cover item id (for highlight). */
  selectedCoverId?: string | null;
  /** User's previously uploaded covers (V2 — empty for now). */
  userUploads?: CoverMediaItem[];
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const TABS: { id: TabId; label: string }[] = [
  { id: "featured", label: "Featured" },
  { id: "gifs", label: "GIFs" },
  { id: "uploads", label: "My Uploads" },
];

const SCREEN_WIDTH = Dimensions.get("window").width;
const GRID_GAP = 8;
const GRID_PADDING = 16;
const COLUMN_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2;

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

/** Tab bar — simple text tabs with underline indicator. */
function TabBar({
  activeTab,
  onSelect,
}: {
  activeTab: TabId;
  onSelect: (tab: TabId) => void;
}) {
  return (
    <View style={{ flexDirection: "row", paddingHorizontal: 16, marginBottom: 12 }}>
      {TABS.map((tab) => {
        const active = tab.id === activeTab;
        return (
          <Pressable
            key={tab.id}
            onPress={() => {
              Haptics.selectionAsync();
              onSelect(tab.id);
            }}
            style={{
              flex: 1,
              alignItems: "center",
              paddingVertical: 8,
              borderBottomWidth: 2,
              borderBottomColor: active ? "#FFFFFF" : "rgba(255,255,255,0.08)",
            }}
          >
            <Text
              style={{
                fontSize: 13,
                fontWeight: active ? "700" : "500",
                color: active ? "#FFFFFF" : "rgba(255,255,255,0.4)",
              }}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Category chip rail — horizontal scroll of filter chips. */
function CategoryChipRail({
  activeCategory,
  onSelect,
}: {
  activeCategory: string;
  onSelect: (id: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
      style={{ flexGrow: 0, marginBottom: 12 }}
    >
      {COVER_CATEGORIES.map((cat) => {
        const active = cat.id === activeCategory;
        return (
          <Pressable
            key={cat.id}
            onPress={() => {
              Haptics.selectionAsync();
              onSelect(cat.id);
            }}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 6,
              borderRadius: 16,
              backgroundColor: active ? "rgba(255,255,255,0.15)" : "rgba(255,255,255,0.05)",
              borderWidth: 1,
              borderColor: active ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.08)",
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: active ? "600" : "500",
                color: active ? "#FFFFFF" : "rgba(255,255,255,0.5)",
              }}
            >
              {cat.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Single thumbnail in the grid. */
function CoverThumbnail({
  item,
  selected,
  onPress,
}: {
  item: CoverMediaItem;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        width: COLUMN_WIDTH,
        aspectRatio: 4 / 3,
        borderRadius: 12,
        overflow: "hidden",
        borderWidth: selected ? 2.5 : 0,
        borderColor: selected ? "#FFFFFF" : "transparent",
      }}
    >
      <ExpoImage
        source={{ uri: item.thumbnailUrl }}
        style={{ width: "100%", height: "100%" }}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={200}
      />
      {item.type === "gif" && (
        <View
          style={{
            position: "absolute",
            bottom: 4,
            right: 4,
            backgroundColor: "rgba(0,0,0,0.6)",
            borderRadius: 4,
            paddingHorizontal: 5,
            paddingVertical: 1,
          }}
        >
          <Text style={{ fontSize: 9, fontWeight: "700", color: "#FFFFFF" }}>GIF</Text>
        </View>
      )}
    </Pressable>
  );
}

/** Empty state for My Uploads tab. */
function UploadsEmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 40 }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: "rgba(255,255,255,0.06)",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 12,
        }}
      >
        <ImagePlus size={24} color="rgba(255,255,255,0.3)" />
      </View>
      <Text style={{ fontSize: 14, fontWeight: "600", color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>
        No uploads yet
      </Text>
      <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.3)", marginBottom: 16 }}>
        Add your own cover photos
      </Text>
      <Pressable
        onPress={onUpload}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: 12,
          backgroundColor: "rgba(255,255,255,0.10)",
        }}
      >
        <Upload size={14} color="#FFFFFF" />
        <Text style={{ fontSize: 13, fontWeight: "600", color: "#FFFFFF" }}>Upload image</Text>
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function CoverMediaPickerSheet({
  visible,
  onClose,
  onSelectCover,
  onPickLocalImage,
  selectedCoverId,
  userUploads = [],
}: CoverMediaPickerSheetProps) {
  const [activeTab, setActiveTab] = useState<TabId>("featured");
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Reset state when sheet opens
  React.useEffect(() => {
    if (visible) {
      setActiveTab("featured");
      setActiveCategory("all");
      setSearchQuery("");
    }
  }, [visible]);

  // Filter items based on tab, category, and search
  const filteredItems = useMemo(() => {
    let items: CoverMediaItem[] = [];

    if (activeTab === "featured") {
      items = FEATURED_COVERS;
      if (activeCategory !== "all") {
        items = items.filter((i) => i.category === activeCategory);
      }
    } else if (activeTab === "gifs") {
      items = MOCK_GIFS;
    } else {
      items = userUploads;
    }

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (i) =>
          i.tags?.some((t) => t.includes(q)) ||
          i.category?.includes(q),
      );
    }

    return items;
  }, [activeTab, activeCategory, searchQuery, userUploads]);

  const handleSelectItem = useCallback(
    (item: CoverMediaItem) => {
      Haptics.selectionAsync();
      onSelectCover(item);
      onClose();
    },
    [onSelectCover, onClose],
  );

  const handleUploadPress = useCallback(() => {
    Haptics.selectionAsync();
    onPickLocalImage();
    onClose();
  }, [onPickLocalImage, onClose]);

  const renderItem = useCallback(
    ({ item }: { item: CoverMediaItem }) => (
      <CoverThumbnail
        item={item}
        selected={selectedCoverId === item.id}
        onPress={() => handleSelectItem(item)}
      />
    ),
    [selectedCoverId, handleSelectItem],
  );

  const keyExtractor = useCallback((item: CoverMediaItem) => item.id, []);

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Cover Media"
      heightPct={0.75}
      maxHeightPct={0.9}
      backdropOpacity={0.4}
      keyboardMode="padding"
    >
      {/* Search bar */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          marginHorizontal: 16,
          marginBottom: 12,
          paddingHorizontal: 12,
          height: 38,
          borderRadius: 12,
          backgroundColor: "rgba(255,255,255,0.06)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.08)",
        }}
      >
        <Search size={16} color="rgba(255,255,255,0.35)" />
        <TextInput
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search covers..."
          placeholderTextColor="rgba(255,255,255,0.3)"
          style={{
            flex: 1,
            marginLeft: 8,
            fontSize: 14,
            color: "#FFFFFF",
          }}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
            <X size={14} color="rgba(255,255,255,0.4)" />
          </Pressable>
        )}
      </View>

      {/* Tab bar */}
      <TabBar activeTab={activeTab} onSelect={setActiveTab} />

      {/* Category chips — only on Featured tab */}
      {activeTab === "featured" && (
        <CategoryChipRail activeCategory={activeCategory} onSelect={setActiveCategory} />
      )}

      {/* Content */}
      {activeTab === "uploads" && userUploads.length === 0 ? (
        <UploadsEmptyState onUpload={handleUploadPress} />
      ) : (
        <FlatList
          data={filteredItems}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          numColumns={2}
          columnWrapperStyle={{ gap: GRID_GAP, paddingHorizontal: GRID_PADDING }}
          contentContainerStyle={{ gap: GRID_GAP, paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>
                No results found
              </Text>
            </View>
          }
          ListFooterComponent={
            activeTab !== "uploads" ? (
              <Pressable
                onPress={handleUploadPress}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  paddingVertical: 12,
                  marginHorizontal: GRID_PADDING,
                  marginTop: 4,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.10)",
                  borderStyle: "dashed",
                  backgroundColor: "rgba(255,255,255,0.03)",
                }}
              >
                <Upload size={14} color="rgba(255,255,255,0.5)" />
                <Text style={{ fontSize: 13, fontWeight: "600", color: "rgba(255,255,255,0.5)" }}>
                  Upload your own image
                </Text>
              </Pressable>
            ) : null
          }
        />
      )}
    </BottomSheet>
  );
}
