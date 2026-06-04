import React, {useState} from 'react';
import {View, Text, Pressable, Image, TextInput} from 'react-native';
import styles from '../assets/styles';
import mtyles from '../assets/mtyles';
import { useNavigation } from '@react-navigation/native';
import useInform from '../hooks/useInform';
import { useUserState } from '../contexts/UserContext';
import client from '../api/client';
import authStorage from '../storages/authStorage';
import { useConfigState } from '../contexts/ConfigContext';

export default function LoginStep1Screen(){
    const navigation = useNavigation();
    const inform = useInform();
    const [user, setUser] = useUserState();
    const [config, setConfig] = useConfigState();
    const [mb_email, setMb_email] = useState("");
    const [mb_password, setMb_password] = useState("");

    const onlogin = async() =>{
        const params = {
            mb_email, 
            mb_password,
        }

        const response = await client.post(
            '/get-login-check.php',
            null,
            { params }
        )

        const data = response.data;

        if (data.statusCode != "100") {
            inform({
                title: '오류',
                message: data.message,
            })
            return;
        }


        setUser(data.user);
        setConfig(data.config);
        authStorage.set(data);        
        
        navigation.navigate("MainTab", { screen: "홈" })
        // navigation.reset({routes: [{name: "MainTab"}]})        
    }
    return (
        <View style={styles.block}>            
            <View style={[styles.PDSShareView, styles.whiteBlock]}>
                <View style={styles.PDSShareViewLeft}>
                    <Pressable onPress={() => navigation.goBack()}>
                        <Image style={{ width: 18, height: 18, marginRight: 10, }} resizeMode="contain" source={require("../assets/images/icon-arrow-big-left.png")} />
                    </Pressable>
                </View>
                <View style={styles.PDSShareViewMid}>
                    <Text style={styles.PDSShareViewMidText}>로그인</Text>
                </View>
                <Pressable style={styles.PDSShareViewRightCust} onPress={onlogin}>
                    <Text style={styles.PDSShareViewRightCustText}>확인</Text>
                </Pressable>
            </View>
            <View style={mtyles.CommonContentView}>
                <TextInput
                    style={[mtyles.CommonInput,{marginBottom:8}]}
                    placeholder='이메일'
                    keyboardType='email-address'
                    value={mb_email}
                    onChangeText={setMb_email}
                />
                <TextInput
                    style={mtyles.CommonInput}
                    placeholder='비밀번호'
                    secureTextEntry={true}
                    value={mb_password}                
                    onChangeText={setMb_password}
                />
                <View style={mtyles.Rs1sBotView}>
                    <Text style={mtyles.Rs1sBotViewText}>비밀번호를 잊으셨나요?</Text>
                    <Pressable style={mtyles.Rs1sBotViewTextBtn}><Text style={mtyles.Rs1sBotViewTextBtnText}>비밀번호 찾기</Text></Pressable>
                </View>
            </View>
        </View>
    )
}