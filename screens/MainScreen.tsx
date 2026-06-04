import { useNavigation, useFocusEffect } from "@react-navigation/native";
import React, { useEffect, useState} from "react";
import { Text, View, Image, Pressable,  Dimensions,TextInput,ScrollView,Modal, ActivityIndicator} from "react-native";
import styles from "../assets/styles";
import { useUserState } from "../contexts/UserContext";
import mtyles from "../assets/mtyles";
import { Modal001 } from "../modal/Modal001";
import client from "../api/client";
import useInform from "../hooks/useInform";
import ListCom from "../components/ListCom";


//const Tab = createMaterialTopTabNavigator();
interface resultAuth {
    statusCode: string;
    message: string;
}

function MainScreen() {
    // 네비게이션 호출
    const navigation = useNavigation();
    const [user,setUser] = useUserState();
    const {width, height} = Dimensions.get('screen');
    const imgWidth = (width-60)/2;
    const [loading, setLoading] = useState(true);
    const [list, setList] = useState([]);
    const [listRe, setListRe] = useState([]);
    const inform = useInform();

    const onList = async()=>{
    
        const params = {mb_id : user?.mb_id}
        console.log(params);
        const response = await client.post(
            'get-product.php', null, {params}
        )
        
        setList(response.data.list);
        setLoading(false);
        
    }

    useFocusEffect(
        //화면으로 들어왔을 때
        React.useCallback(() => {
            onList();
            return () => {
            //화면에서 나갈 때
            };
        }, [user]),
    );
    


    useEffect(()=>{
        setList(listRe);
    },[listRe])
    
    const [showConfirmDialog,setShowConfirmDialog] = useState(false);
    const openModal = () => {
        setShowConfirmDialog(true)
    }
    const closeModal = () =>{
        setShowConfirmDialog(false);
    }


            
    return (
        <View style={mtyles.block1}>
            <View style={mtyles.MarketListViewTop}>
                <TextInput style={[mtyles.MarketListText,mtyles.MarketListInPut]}>마켓넘버</TextInput>
                <Pressable onPress={openModal}>
                    <Image style={{ width: 40, height: 40}} resizeMode="contain" source={require("../assets/images/Icon_Button.png")} />
                </Pressable>
            </View>
            <View style={mtyles.MarKetListImg}>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
                <View style={mtyles.MarKetListViewMom}>
                    {loading ? 
                        (
                        <View style={{flex:1,justifyContent:"center",alignContent:"center",alignItems:"center"}}>
                            <ActivityIndicator size="large" />
                        </View>
                        ):(
                            list.length > 0 ? (
                                <ListCom list={list} />                                   
                            ):(
                                <View>
                                    <Text>조회된 자료가 없습니다</Text>
                                </View>
                            )
                            
                    )}
                </View>
            </ScrollView>
            <Modal001
                show={showConfirmDialog}
                closeModal={closeModal}
            />
        </View>

    )
}
export default MainScreen;