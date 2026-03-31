@echo off
xcopy "G:\Hive\Hive Landing\*" "G:\Hive Landing\" /E /H /C /Y
rmdir /S /Q "G:\Hive\Hive Landing"
