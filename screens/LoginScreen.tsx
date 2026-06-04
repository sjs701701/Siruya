import React, { useState, useEffect } from "react";
import { View, Pressable, Text, Platform, Image, ScrollView, Button , ImageBackground } from "react-native";
import styles from "../assets/styles";
import mtyles from "../assets/mtyles";
import { useNavigation } from "@react-navigation/native";
import useNaverLogin from "../hooks/useNaverLogin";
import { TextInput } from "react-native-gesture-handler";
import { useUserState } from "../contexts/UserContext";
import authStorage from "../storages/authStorage";
import useInform from "../hooks/useInform";
import client from "../api/client";
import AsyncStorage from "@react-native-async-storage/async-storage";

interface resultAuth {
    statusCode: string;
    message: string;
    jwt: string;
    user: User;
}

function LoginScreen() {
    const [user, setUser] = useUserState();
    const [mb_hp, setMb_hp] = useState('');
    const [mb_password, setMb_password] = useState('');
    const inform = useInform();
    const [jwt, setJwt] = useState('');

    const navigation = useNavigation();

    useEffect(() => {
        AsyncStorage.getItem('jwt', (err, result) => { //user_id에 담긴 아이디 불러오기
            setJwt(result);
        });
    }, []);

    const onLoginStep1 = () =>{
        navigation.navigate("LoginStep1Screen");
    }
    const onRegisterStep1 = () =>{
        navigation.navigate("RegisterStep1Screen");
    }


    return (
        <View style={[mtyles.block]}>
            <ImageBackground source={require("../assets/images/Main.png")} style={mtyles.bgImage}>
                <View style={[mtyles.MainBox,mtyles.All]}>
                    <Text style={mtyles.MainText}>마켓넘버</Text>
                </View>
                <View style={mtyles.MainView}>
                    <Pressable style={[mtyles.MainBtnClass, mtyles.MainBtnClassBlue]} onPress={onRegisterStep1}>
                        <Text style={[mtyles.MainBtnClassText,mtyles.MainBtnClassTextFFF]}>회원가입</Text>
                    </Pressable>
                    <Pressable style={mtyles.MainBtnClass} onPress={onLoginStep1}>
                        <Text style={mtyles.MainBtnClassText}>로그인</Text>
                    </Pressable>
                    <Text style={mtyles.MainBotText}>
                        로그인할 경우 귀하는 <Text style={mtyles.MainBotTextBold}>이용약관</Text>과 <Text style={mtyles.MainBotTextBold}>개인정보 처리방침, 개인 정보 수집 및
                        이용 동의서</Text>를 읽고 동의한 것으로 간주됩니다.
                    </Text>
                </View>
                
            </ImageBackground>
        </View>
    )
}

export default LoginScreen;