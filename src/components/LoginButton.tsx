import React from "react";
import { Pressable, Text } from "react-native";

import { authClient } from "@/lib/authClient";
import { useSession } from "@/lib/useSession";
import { cn } from "@/lib/cn";
import { useRouter } from "expo-router";

const LoginButton = () => {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  return (
    <Pressable
      disabled={isPending}
      onPress={async () => {
        if (session) {
          // Route to settings for proper logout
          router.push("/settings");
        } else {
          router.replace("/login");
        }
      }}
      className={cn("p-4 rounded-md", session ? "bg-red-500" : "bg-blue-500")}
    >
      <Text className="text-white">{session ? "Go to Settings" : "Login"}</Text>
    </Pressable>
  );
};

export default LoginButton;
