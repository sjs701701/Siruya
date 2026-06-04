import { StyleSheet, Platform } from "react-native";
const Fonts = {
    PretendardBold: "Pretendard-Bold",
    Pretendard: "Pretendard-Medium",
    PretendardThin: "Pretendard-Thin"
}

const mtyles = StyleSheet.create({

    //공통
    CommonContentView : {paddingHorizontal:16,paddingVertical:16},
    CommonInput:{borderBottomColor:"#E9E9E9",borderBottomWidth:1,height:40},
    ProfileContentView : {paddingHorizontal:16,paddingVertical:16},
    ProfileInput:{borderBottomColor:"#E9E9E9",borderBottomWidth:1},

    /*마켓넘버 메인*/
    block:{flex:1,backgroundColor:"#ECEEF0"},
    All:{padding:20},
    MainBox:{marginTop:64,alignItems:"center",flex:1},
    MainText:{fontSize:48,fontWeight:"700",color:"#292929"},
    bgImage:{width: '100%', height: '100%', flex:1},
    MainView:{justifyContent:"center",alignItems:"center",flex:1,padding:16},
    MainTop:{borderWidth:1,height:56,backgroundColor:"#004FFF"},
    MainBtnClass: {width:"100%",backgroundColor:"#fff",alignItems:"center",paddingVertical:15,marginBottom:16,borderRadius:12,},
    MainBtnClassBlue:{backgroundColor:"#004FFF"},
    MainBtnClassText:{fontSize:18,fontWeight:"600"},
    MainBtnClassTextFFF:{color:"#fff"},
    MainBotText: {fontSize:12,textAlign:"center"},
    MainBotTextBold: {fontWeight:"600"},
    

    /*로그인*/
    block1:{flex:1,backgroundColor:"#FFFFFF"},
    AllView:{padding:20,flexDirection:"row"},
    ComText:{flex:1,marginHorizontal:145},
    ComLine:{borderWidth:1,borderColor:"#E8EEF2"},
    Rs1sBotView : {flexDirection:"row",justifyContent:"center",marginTop:30},
    Rs1sBotViewText : {fontSize:16},
    Rs1sBotViewTextBtn : {paddingHorizontal:5},
    Rs1sBotViewTextBtnText : {fontSize:16,color:"#004FFF"},

    /*리스트*/
    MarketListViewTop:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",margin:15},
    MarketListText:{fontSize:17,color:"#464A4D",fontWeight:"700"},
    MarketListInPut:{width:280,height:40},
    MarketListLine:{borderBottomWidth:1,borderBottomColor:"#E8EEF2"},
    MarKetListViewMom: {paddingHorizontal:20,flexDirection:"row",flexWrap:"wrap",justifyContent:"space-between"},
    MarKetListView:{position:"relative"},
    MarKetListlogo:{position:"absolute",padding:5},
    MarKetListlogo2:{position:"absolute",padding:5,right:5},
    MarKetListImg:{borderBottomWidth:1,marginBottom:20,borderBottomColor:"#E8EEF2"},
    MarKetListTextView:{marginTop:5,minHeight:110},
    MarKetListTextMain:{fontSize:16,color:"#17191A",fontWeight:"700"},
    MarKetListTextMidTop:{fontSize:12,color:"#757B80",fontWeight:"400"},
    MarKetListTextMidBot:{fontSize:16,color:"#17191A",fontWeight:"700"},
    MarKetListTextBot:{fontSize:12,color:"#757B80",fontWeight:"400"},
    
  
    
    /*상세페이지*/
    DPage:{flexDirection:"row",alignItems:"center"},
    DPageTop:{padding:20},
    DPageTopL:{alignItems:"center",},
    DPageTopR:{},
    DPageMTextTop:{fontSize:17,color:"#454A4D",fontWeight:"700"},
    DPageMTextMid:{fontSize:22,color:"#454A4D",fontWeight:"700"},
    DPageMTextBot:{fontSize:22,color:"#004FFF",fontWeight:"700"},
    DPageMText:{fontSize:16,color:"#454A4D"},
    DPageMTop:{marginTop:10},
    DPageMBot:{marginTop:20},
    DPagelogo:{position:"absolute",padding:5,right:350},

    /*번개장터에서 거래하기*/
    DealAll:{paddingHorizontal:20},
    DealImgBoxMom:{justifyContent:"center",alignItems:"center"},
    DealImgBox:{width:195,borderRadius:10,backgroundColor:"#E8EEF2",marginTop:20},
    DealImgBoxMid:{alignItems:"center"},
    DealImgBoxIn:{marginTop:10},
    DealImgBoxIn2:{marginTop:20},
    DealImgBoxIn3:{justifyContent:"center",alignItems:"center", },
    DealImgTextTop:{color:"#000000",fontSize:17,fontWeight:"700",marginTop:0},
    DealImgTextMid:{color:"#000000",fontSize:20,fontWeight:"700",marginTop:5},
    DealImgTextBot:{color:"#757B80",fontSize:12,fontWeight:"400",marginTop:10},
    DealBotLine:{borderTopWidth:1,borderTopColor:"#E8EEF2",marginTop:10},
    DealBotBox:{marginTop:10,justifyContent:"center",alignItems:"center"},
    DealBotTextM:{color:"#454A4D",fontSize:14,fontWeight:"700"},
    DealBotTextB:{color:"#757B80",fontSize:12,fontWeight:"400",marginTop:2},
    DealImgView:{flexDirection:"row",margin:30,alignItems:"center"},

    /*검색*/
    SearchView:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
    Search:{width:380,height:32,borderRadius:10,backgroundColor:"#E8EEF2"},
    SearchInPutText:{height:50,width:350},
    SearchAll:{padding:20},
    SearchNL:{color:"#17191A",fontSize:20,fontWeight:"700"},
    SearchNR:{color:"#737B80",fontSize:15,fontWeight:"400"},
    SearchMid:{justifyContent:"center",alignItems:"center",marginTop:30,marginBottom:40},
    SearchMidText:{color:"#A1ADB2",fontSize:15,fontWeight:"400"},
    SearchBox:{borderWidth:1,borderColor:"#E6EEF2",padding:10,marginRight:5,borderRadius:200},
    SearchBoxText:{flexDirection:"row",marginTop:10,},
    SearchBoxTextCom:{paddingRight:5,color:"#454A4D",fontSize:15,fontWeight:"bold"},
    SearchBoxTextComBot:{color:"#454A4D",fontSize:15,fontWeight:"400"},

    /*AI시세*/
    AITop:{width:100},
    AISearch:{justifyContent:"center",alignItems:"center"},
    AISearchText:{fontSize:20,color:"#757B80",fontWeight:"700"},
    AIView:{justifyContent:"space-between",alignItems:"center",marginTop:15,padding:15},
    AITopText:{color:"#464A4D",fontSize:17,fontWeight:"700"},
    AIBoxTop:{height:31,borderRadius:10,backgroundColor:"#E8EEF2",flexDirection:"row"},
    AIBoxTopL:{justifyContent:"center",margin:3,flex:1,height:25,borderRadius:5,backgroundColor:"#FFF"},
    AIBoxTopR:{justifyContent:"center",margin:3,flex:1,height:25,borderRadius:10,backgroundColor:"#E8EEF2"},
    AIBoxTopLText:{textAlign:"center",color:"#1A1A17",fontSize:13,fontWeight:"600"},
    AIBoxMid:{padding:15,marginTop:10,borderRadius:5,width:"100%",height:150,backgroundColor:"#E8EEF2"},
    AIBoxInTopText:{flexDirection:"row",justifyContent:"space-between",marginBottom:10},
    AIBoxInTextCom:{color:"#17191A",fontSize:16,fontWeight:"700"},
    AIBoxInLine:{borderTopWidth:1,borderColor:"#BBC5CC"},
    AIBoxInMid:{justifyContent:"center",alignItems:"center"},
    AIBoxInMidText:{fontSize:22,fontWeight:"700",color:"#004FFF",marginTop:10},
    AIBoxInBot:{position:"relative",marginTop:10,height:10,backgroundColor:"#FFFFFF",borderRadius:20,justifyContent:"center",alignItems:"center"},
    AIBoxInBotColor:{marginTop:30,height:10,width:150,backgroundColor:"#004FFF",borderRadius:20},
    AIBoxInBotColorBox:{position:"absolute",borderWidth:2,width:40,height:25,backgroundColor:"#FFF",alignItems:"center",justifyContent:"center",borderRadius:5,borderColor:"#004FFF",right:"35%"},
    AIBoxInBotColorBoxText:{color:"#004FFF"},
    AIBotView:{marginTop:20},
    AIBotTopText:{color:"#000000",fontSize:18,fontWeight:"700"},
    AIBotBotText:{color:"#000000",fontSize:16,fontWeight:"400"},
    AIBotBot:{marginTop:30},
    AIBoxInBotColorBoxN:{flexDirection:"row",height:30},
    AIBoxInBotBoxNText:{marginRight:120,color:"#464A4D",fontSize:14,fontWeight:"700"},
    AIBoxInBotBoxNText2:{color:"#464A4D",fontSize:14,fontWeight:"700"},
    
    /*알림*/
    Inform:{padding:15},
    InformView:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:15},
    InformEnd:{flexDirection:"row"},
    InformTextMain:{color:"#000000",fontSize:18,fontWeight:"700"},
    InformTextCom:{color:"#000000",fontSize:14,fontWeight:"400"},
    
    /*페이지*/
    SearchPage:{marginTop:15},
    SearchPage2:{height:600},

    /*마이페이지*/
    SetupScreen2All:{flexDirection:"row",marginTop:10,padding:15,alignItems:"center"},
    SetupScreen2MText:{color:"#4D4C45",fontSize:16,fontWeight:"700"},
    SetupScreen2SText:{color:"#807E73",fontSize:12,fontWeight:"400",marginTop:5},
    SetupScreen2View:{padding:15},
    SetupScreen2Line:{borderBottomWidth:1,borderBottomColor:"#E8EEF2"},
    SetupScreen2Icon:{flexDirection:"row",marginTop:20},
    SetupScreen2IconCom:{flex:1},
    SetupScreen2:{justifyContent:"center",alignItems:"center"},
    SetupScreen2Text:{color:"#000000",fontSize:14,fontWeight:"600",marginTop:10},
    SetupScreen2ColorBox:{marginTop:10,height:100,backgroundColor:"#233D7F",padding:20,justifyContent:"center"},
    SetupScreen2ColorBoxText:{color:"#FFFFFF",fontSize:16,fontWeight:"700"},
    SetupScreen2ColorBoxTextBot:{color:"#FFFFFF",fontSize:12,fontWeight:"400",marginTop:5},
    SetupScreen2BotAll:{marginTop:10},
    SetupScreen2BotTop:{borderBottomWidth:1,marginLeft:15,borderBottomColor:"#E8EEF2"},
    SetupScreen2BotTopText:{padding:15,color:"#000000",fontSize:17,fontWeight:"400"},
    SetupScreen2BotMid:{flexDirection:"row",justifyContent:"space-between"},


    /*모달 */
    RegiModalBox: { zIndex: 3, left: 0, top: 0, position: "absolute", height: "100%", width: "100%", backgroundColor: "#000", opacity: .8 },
    RegiModalBoxItem: { zIndex: 3, left: 0, top: 0, position: "relative", height: "100%", width: "100%", justifyContent: "flex-end", alignContent: "center", alignItems: "center", },
    RegiModalBoxCont: { width: "90%", backgroundColor: "#fff", zIndex: 5, opacity: 1,borderTopLeftRadius:30,borderTopRightRadius:30,},
    RegiModalBoxItem9_1: { zIndex: 3, left: 0, top: 0, position: "relative", height: "100%", width: "100%", justifyContent: "center", alignContent: "center", alignItems: "center", },
    RegiModalBoxCont9_1: { width: "50%", backgroundColor: "#fff", zIndex: 5, opacity: 1,borderRadius:0,},    
    RegiModalBoxCont9_1Btn: {paddingVertical:10,borderBottomWidth:1, borderBottomColor:"#dfdfdf",justifyContent:"center",alignItems:"center"},
    RegiModalBoxCont9_1Text:{fontWeight:"600",color:"#000"},

    /*설정*/
   Setting:{flexDirection:"row"},

   /*찜한상품*/
   RroductList:{marginTop:20},
   RroductListMid: {justifyContent:"center",alignItems:"center"},
   
   
    /*프로필*/
    ProfileCom:{paddingRight:5,color:"#454A4D",fontSize:15,fontWeight:"bold"},
    ProfileBox:{borderWidth:1,marginBottom:10,justifyContent:"center",alignItems:"center",borderColor:"#E6EEF2",height:40,marginRight:5,borderRadius:200,paddingHorizontal:20},
    ProfileBoxColor:{backgroundColor:"#004FFF",borderWidth:1,marginBottom:10,justifyContent:"center",alignItems:"center",borderColor:"#E6EEF2",height:40,marginRight:5,borderRadius:200},
    ProfileText:{flexDirection:"row",marginTop:10,},
    ProfileTextM:{fontSize:15,fontWeight:"bold",color:"#FFFFFF"},
    ProfileTextW:{},
    ProfileBoxC:{borderWidth:1,marginBottom:10,justifyContent:"center",alignItems:"center",borderColor:"#E6EEF2",height:40,marginRight:5,borderRadius:200,paddingHorizontal:20},
    ProfileBoxColorC:{backgroundColor:"#004FFF",borderWidth:1,marginBottom:10,justifyContent:"center",alignItems:"center",borderColor:"#E6EEF2",width:120,height:40,marginRight:5,borderRadius:200},
    ProfileLeft:{marginRight:40},
    Profile:{flexDirection:"row",alignItems:"center",flexWrap:"wrap"},
    ProfileTitleText : {fontSize:15,fontWeight:"bold",color:"#000",paddingVertical:10,marginTop:10},
    ProfileBirth: {color:"#004FFF",fontWeight:"bold",},
})
export default mtyles;