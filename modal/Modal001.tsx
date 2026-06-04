import Dialog from 'react-native-dialog';
import {useState} from 'react';
import { StyleSheet, Image, View, Text, TouchableOpacity, Modal, Pressable} from 'react-native';
import styles from '../assets/styles';
import mtyles from '../assets/mtyles';

export function Modal001(props){
    const [closeActive, setCloseActive] = useState(true);

    const closeFn =()=> props.closeModal();

    return (
        <Modal
            animationType={"fade"}
            transparent={true}
            visible={props.show}
            onRequestClose={() => {
                closeActive == true ? closeFn() : null
            }}
        >
            <View style={mtyles.RegiModalBoxItem9_1}>
                <Pressable
                style={mtyles.RegiModalBox}
                onPress={() => closeFn()}></Pressable>
                <View style={mtyles.RegiModalBoxCont9_1}>
                    <Pressable style={mtyles.RegiModalBoxCont9_1Btn}>
                        <Text style={mtyles.RegiModalBoxCont9_1Text}>낮은가격순</Text>
                    </Pressable>
                    <Pressable style={mtyles.RegiModalBoxCont9_1Btn}>
                        <Text style={mtyles.RegiModalBoxCont9_1Text}>높은가격순</Text>
                    </Pressable>
                    <Pressable style={mtyles.RegiModalBoxCont9_1Btn}>
                        <Text style={mtyles.RegiModalBoxCont9_1Text}>최신순</Text>
                    </Pressable>
                    <Pressable style={mtyles.RegiModalBoxCont9_1Btn}>
                        <Text style={mtyles.RegiModalBoxCont9_1Text}>인기순</Text>
                    </Pressable>
                </View>        
            </View>

        </Modal>
    )
}