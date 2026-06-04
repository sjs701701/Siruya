import React, { useState, useEffect } from "react";
import {View, Pressable, Image,Dimensions, Text} from 'react-native';
import useInform from "../hooks/useInform";
import { useUserState } from "../contexts/UserContext";
import client from "../api/client";
import mtyles from "../assets/mtyles";
import { useNavigation, useFocusEffect } from "@react-navigation/native";

export default function ListCom(props){
    const {width, height} = Dimensions.get('screen');
    const navigation = useNavigation();
    const imgWidth = (width-60)/2;
    const [user,] = useUserState();
    const [list, setList] = useState(props.list);
    const [listRe, setListRe] = useState(props.list);
    const inform = useInform();

    useEffect(()=>{
        setList(props.list);
    },[props.list])
    

    // 리스트 가져오기
    const onRegisterView = (gp_ix) =>{
        navigation.navigate("RegisterView",{gp_ix});
    }

    // const onPressWish =(gp_ix)=>{
    //     props.onPressWish(gp_ix);
    // }

    const onPressWish= async(gp_ix)=>{
        if(!user){
            inform({
                title:"오류",
                message : "로그인 후 이용가능 합니다."
            })
            return;
        }

        const params = {mb_id : user.mb_id, gp_ix : gp_ix}
        const response = await client.post(
            'set-wish.php',null,{params}
        )
        const data = response.data;
        const tmp_gw_ix = data.gw_ix;
        const nextItems = list.map(item => item.gp_ix == gp_ix ? {...item, gw_ix :tmp_gw_ix} : item );

        setListRe(nextItems);
    }
    useEffect(()=>{
        setList(listRe);
    },[listRe])

    return (
        list.map((item, index)=>
            <View style={[mtyles.MarKetListView,{width: imgWidth}]} key={index} >
                <Pressable onPress={()=>onRegisterView(item.gp_ix)}>
                    <Image style={{ width: imgWidth, height: imgWidth, borderRadius:5}} resizeMode="contain" source={{uri:item.img}} />    
                </Pressable>
                <View style={mtyles.MarKetListlogo}>
                    {item.gp_sell_type == "번개장터" ? (
                        <Image style={{ width: 35, height: 35, borderRadius:5}} resizeMode="contain" source={require("../assets/images/Mainlogo.png")} />
                    ):null}
                    {item.gp_sell_type == "중고나라" ? (
                        <Image style={{ width: 35, height: 35, borderRadius:5}} resizeMode="contain" source={require("../assets/images/Mainlogo2.png")} />
                    ):null}
                    {item.gp_sell_type == "당근" ? (
                        <Image style={{ width: 35, height: 35, borderRadius:5}} resizeMode="contain" source={require("../assets/images/Mainlogo3.png")} />
                    ):null}
                    
                </View>
                {user ? (
                    <Pressable style={mtyles.MarKetListlogo2} onPress={()=>onPressWish(item.gp_ix)}>
                        {item.gw_ix ? (
                            <Image style={{ width: 35, height: 35, top:imgWidth-50}} resizeMode="contain" source={require("../assets/images/icon-heart-fill-color.png")} />
                        ):(
                            <Image style={{ width: 35, height: 35, top:imgWidth-50}} resizeMode="contain" source={require("../assets/images/icon-heart-fill.png")} />
                        )}
                        {/* <Image style={{ width: 35, height: 35, top:imgWidth-20}} resizeMode="center" source={require("../assets/images/icon-heart-fill-color.png")} /> */}
                    </Pressable>
                ):(
                    <Pressable style={mtyles.MarKetListlogo2} onPress={()=>onPressWish(item.gp_ix)}>
                        <Image style={{ width: 35, height: 35, top:imgWidth-50}} resizeMode="contain" source={require("../assets/images/icon-heart-fill.png")} />
                    </Pressable>
                )}
                <View style={mtyles.MarKetListTextView}>
                    <Text style={mtyles.MarKetListTextMain} numberOfLines={2} ellipsizeMode="tail">{item.gp_subject}</Text>
                    <Text style={mtyles.MarKetListTextMidTop}>{item.gp_basic}</Text>
                    <Text style={mtyles.MarKetListTextMidBot}>{item.gp_price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}원</Text>
                    <Text style={mtyles.MarKetListTextBot}>끌올 3월 6일 분당구 금곡동</Text>
                </View>
            </View>
        )
    )
}