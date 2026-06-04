import React, { useRef } from "react";
import { Pressable, Image } from 'react-native';
import { useNavigation } from "@react-navigation/native";
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from "./types";
import MainTab from "./MainTab";
import LoginScreen from "./LoginScreen";
import useAuthLoadEffect from "../hooks/useAuthLoadEffect";

const Stack = createNativeStackNavigator<RootStackParamList>();


function RootStack() {
    useAuthLoadEffect();
    const navigation = useNavigation();
    setTimeout(() => {
        //SplashScreen.hide();
    }, 3000)

    const onPressBack = () => {
        //navigation.goBack();
        navigation.goBack();
    }

    return (


        <Stack.Navigator
            screenOptions={{
                headerShadowVisible: false
            }}
        >
            <Stack.Screen
                name="MainTab"
                component={MainTab}
                options={{ headerShown: false }}
            />
            <Stack.Screen
                name="LoginScreen"
                component={LoginScreen}
                options={{ headerShown: false }}
            />
        </Stack.Navigator>
    )

}

export default RootStack;